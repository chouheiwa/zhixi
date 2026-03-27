/**
 * Proxy fetch through service worker -> content script for authenticated API access.
 * Works from both service worker context and popup/dashboard context.
 */
export async function proxyFetch<T = unknown>(url: string): Promise<T> {
  // If we're in the service worker context, we have direct access to tabs
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    return proxyViaContentScript<T>(url);
  }

  // From popup/dashboard, relay through service worker
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'fetchProxy', url },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.data as T);
      }
    );
  });
}

async function proxyViaContentScript<T>(url: string): Promise<T> {
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
        setTimeout(resolve, 1500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
