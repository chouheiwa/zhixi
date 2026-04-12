/**
 * Cross-browser host permission helpers for the zhihu.com origin.
 *
 * Chrome MV3 grants `host_permissions` at install time, so `contains()`
 * always returns true and `request()` is effectively a no-op. Firefox MV3
 * treats `host_permissions` as **optional** — users must explicitly grant
 * access via `about:addons` or via a `permissions.request()` call made from
 * a user gesture (click/keydown). Without the grant, any fetch with
 * `credentials: 'include'` against zhihu.com is silently blocked.
 *
 * These helpers wrap that difference so callers (popup, dashboard,
 * service-worker) can uniformly check/request without branching by browser.
 */

export const ZHIHU_ORIGINS: readonly string[] = ['https://www.zhihu.com/*'];

const permissionsRequest = { origins: [...ZHIHU_ORIGINS] };

/**
 * Returns true if the extension already holds `host_permissions` for zhihu.com.
 * In Chrome this is effectively always true (the permission is required at
 * install time); in Firefox it depends on whether the user has opted in.
 */
export async function hasZhihuHostPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(permissionsRequest);
  } catch {
    // If `chrome.permissions` is unavailable (should never happen in a real
    // MV3 build), fall back to assuming granted so existing code paths are
    // not blocked.
    return true;
  }
}

/**
 * Prompts the user to grant `host_permissions` for zhihu.com. MUST be called
 * from inside a user-gesture handler (click, keydown) — Firefox will reject
 * the request otherwise. Returns true if the permission is now held.
 *
 * Short-circuits when the permission is already granted so the browser does
 * not show a redundant prompt.
 */
export async function requestZhihuHostPermission(): Promise<boolean> {
  if (await hasZhihuHostPermission()) {
    return true;
  }
  try {
    return await chrome.permissions.request(permissionsRequest);
  } catch {
    return false;
  }
}
