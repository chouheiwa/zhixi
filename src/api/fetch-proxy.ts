/**
 * Proxy fetch through content script for authenticated API access.
 * Used by popup/dashboard/service-worker to call Zhihu API.
 */
export async function proxyFetch<T = unknown>(url: string): Promise<T> {
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
