/**
 * Direct fetch to Zhihu API with cookie authentication.
 * Service Worker can fetch cross-origin with credentials via host_permissions.
 */
export async function proxyFetch<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
