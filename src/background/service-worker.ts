import { formatDate } from '@/shared/date-utils';
import { STORAGE_KEYS } from '@/shared/constants';
import { fetchDateRangeIncome, fetchCurrentUser } from '@/api/zhihu-income';
import { upsertIncomeRecords, hasRecordsForDate } from '@/db/income-store';
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
  }).catch(() => {
    // No listeners — that's fine
  });
}

async function runCollection(startDate: string, endDate: string): Promise<{ count: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: 0 };
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();

    const records = await fetchDateRangeIncome(
      startDate,
      endDate,
      user.id,
      {
        shouldSkipDate: (date) => hasRecordsForDate(user.id, date),
        onProgress: (currentDate, current, total, skipped) => {
          collectionStatus = {
            isCollecting: true,
            progress: current,
            total,
            currentDate: skipped ? `${currentDate} (已跳过)` : currentDate,
          };
          broadcastStatus();
        },
      }
    );

    await upsertIncomeRecords(records);

    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();

    return { count: records.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : '采集失败';
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Message Handling ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/dashboard/index.html'),
    });
    return;
  }

  if (message.action === 'startCollect') {
    runCollection(message.startDate, message.endDate)
      .then((result) => sendResponse({ ok: true, count: result.count }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === 'getCollectStatus') {
    sendResponse(collectionStatus);
    return;
  }

  // Forward fetchProxy from popup/dashboard to content script
  if (message.action === 'fetchProxy' && !sender.tab) {
    forwardToContentScript(message.url)
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// ============ Fetch Proxy ============

async function forwardToContentScript(url: string): Promise<unknown> {
  let tabs = await chrome.tabs.query({ url: 'https://www.zhihu.com/*' });

  if (tabs.length === 0) {
    const newTab = await chrome.tabs.create({ url: 'https://www.zhihu.com/', active: false });
    await waitForTabReady(newTab.id!);
    tabs = await chrome.tabs.query({ url: 'https://www.zhihu.com/*' });
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'fetchProxy',
        url,
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch {
      continue;
    }
  }

  throw new Error('无法连接到知乎页面，请刷新后重试');
}

function waitForTabReady(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ============ Auto-collect on Zhihu visit ============

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://www.zhihu.com/')) return;

  const yesterday = formatDate((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
  if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === yesterday) return;

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_COLLECT_DATE]: yesterday });

  try {
    await runCollection(yesterday, yesterday);
  } catch {
    // Silent fail for auto-collect
  }
});
