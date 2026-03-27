/**
 * Proxy fetch through content script for authenticated API access.
 * If no Zhihu tab is open, automatically opens one and waits for it to load.
 */
export async function proxyFetch<T = unknown>(url: string): Promise<T> {
  let tabs = await chrome.tabs.query({ url: 'https://www.zhihu.com/*' });

  if (tabs.length === 0) {
    // Auto-open a Zhihu page and wait for content script to be ready
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
      if (response.error) {
        throw new Error(response.error);
      }
      return response.data as T;
    } catch {
      continue;
    }
  }

  throw new Error('无法连接到知乎页面，请刷新知乎页面后重试');
}

function waitForTabReady(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra delay for content script injection
        setTimeout(resolve, 1500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
