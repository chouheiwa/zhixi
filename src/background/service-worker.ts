import { formatDate } from '@/shared/date-utils';
import { STORAGE_KEYS, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX } from '@/shared/constants';
import { fetchDayIncome, fetchCurrentUser } from '@/api/zhihu-income';
import { fetchContentDaily, parseContentDailyResponse } from '@/api/zhihu-content-daily';
import { upsertIncomeRecords, getMissingDates, getUserSettings, saveUserSettings } from '@/db/income-store';
import { upsertContentDailyRecords, getContentDailyLatestDate } from '@/db/content-daily-store';
import type { CollectionStatus } from '@/shared/types';

// ============ Collection State ============

let collectionStatus: CollectionStatus = {
  isCollecting: false,
  progress: 0,
  total: 0,
};

function broadcastStatus() {
  chrome.runtime.sendMessage({
    action: 'collectStatus',
    status: collectionStatus,
  }).catch(() => {});
}

function randomDelay(): Promise<void> {
  const ms = REQUEST_INTERVAL_MIN + Math.random() * (REQUEST_INTERVAL_MAX - REQUEST_INTERVAL_MIN);
  return new Promise((r) => setTimeout(r, ms));
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// ============ Income Sync ============

async function runSync(startDate?: string): Promise<{ count: number; synced: number; total: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: 0 };
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();

    if (startDate) {
      await saveUserSettings({ userId: user.id, collectStartDate: startDate });
    }

    const settings = await getUserSettings(user.id);
    if (!settings?.collectStartDate) {
      throw new Error('请先设置采集起始日期');
    }

    const missingDates = await getMissingDates(user.id, settings.collectStartDate);

    if (missingDates.length === 0) {
      collectionStatus = { isCollecting: false, progress: 0, total: 0 };
      broadcastStatus();
      return { count: 0, synced: 0, total: 0 };
    }

    collectionStatus = { isCollecting: true, progress: 0, total: missingDates.length };
    broadcastStatus();

    let totalRecords = 0;

    for (let i = 0; i < missingDates.length; i++) {
      if (i > 0) await randomDelay();

      const date = missingDates[i];
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: missingDates.length,
        currentDate: date,
      };
      broadcastStatus();

      const dayRecords = await fetchDayIncome(date, user.id);
      if (dayRecords !== null && dayRecords.length > 0) {
        await upsertIncomeRecords(dayRecords);
        totalRecords += dayRecords.length;
      }
    }

    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();

    return { count: totalRecords, synced: missingDates.length, total: missingDates.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : '采集失败';
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Content Daily Batch Fetch ============

interface ContentItem {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
}

async function runFetchContentDaily(items: ContentItem[]): Promise<{ count: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: items.length };
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();
    const yesterday = getYesterday();
    let totalRecords = 0;

    for (let i = 0; i < items.length; i++) {
      if (i > 0) await randomDelay();

      const item = items[i];
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: items.length,
        currentDate: item.title.length > 15 ? item.title.slice(0, 15) + '...' : item.title,
      };
      broadcastStatus();

      // Determine start date: day after latest collected, or publish date
      const latestDate = await getContentDailyLatestDate(user.id, item.contentToken);
      let startDate: string;
      if (latestDate) {
        // Start from day after latest
        const d = new Date(latestDate);
        d.setDate(d.getDate() + 1);
        startDate = formatDate(d);
        if (startDate > yesterday) continue; // already up to date
      } else {
        startDate = item.publishDate;
      }

      try {
        const apiItems = await fetchContentDaily(item.contentType, item.contentToken, startDate, yesterday);
        const records = parseContentDailyResponse(apiItems, user.id, item.contentToken, item.contentId, item.contentType, item.title);
        if (records.length > 0) {
          await upsertContentDailyRecords(records);
          totalRecords += records.length;
        }
      } catch {
        // Skip failed items, continue with rest
      }
    }

    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();

    return { count: totalRecords };
  } catch (err) {
    const message = err instanceof Error ? err.message : '拉取失败';
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Message Handling ============

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/dashboard/index.html'),
    });
    return;
  }

  if (message.action === 'syncIncome') {
    runSync(message.startDate)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === 'fetchContentDaily') {
    runFetchContentDaily(message.items)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === 'getCollectStatus') {
    sendResponse(collectionStatus);
    return;
  }
});

// ============ Auto-sync on Zhihu visit ============

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://www.zhihu.com/')) return;

  const today = formatDate(new Date());
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
  if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === today) return;

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_COLLECT_DATE]: today });

  try {
    await runSync();
  } catch {
    // Silent fail for auto-sync
  }
});
