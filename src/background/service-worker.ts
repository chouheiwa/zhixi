import { formatDate } from '@/shared/date-utils';
import { STORAGE_KEYS } from '@/shared/constants';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/dashboard/index.html'),
    });
    return;
  }

  if (message.action === 'fetchProxy' && !sender.tab) {
    forwardToContentScript(message.url)
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function forwardToContentScript(url: string): Promise<unknown> {
  const tabs = await chrome.tabs.query({ url: 'https://www.zhihu.com/*' });

  if (tabs.length === 0) {
    throw new Error('请打开一个知乎页面以启用数据采集');
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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://www.zhihu.com/')) return;

  const today = formatDate(new Date());
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
  if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === today) return;

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_COLLECT_DATE]: today });

  try {
    await chrome.runtime.sendMessage({ action: 'autoCollect', date: today });
  } catch {
    // No listener open
  }
});
