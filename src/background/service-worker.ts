import { formatDate } from '@/shared/date-utils';
import { STORAGE_KEYS, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX } from '@/shared/constants';
import { fetchDayIncome, fetchCurrentUser } from '@/api/zhihu-income';
import { upsertIncomeRecords, getMissingDates, getUserSettings, saveUserSettings } from '@/db/income-store';
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

/**
 * Smart sync: collect only missing dates for the current user.
 * If startDate is provided, save it as the user's collect start date.
 */
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
