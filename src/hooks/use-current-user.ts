import { useState, useEffect } from 'react';
import { fetchCurrentUser } from '@/api/zhihu-income';
import { getSavedAccounts, saveAccount } from '@/db/account-store';
import type { ZhihuUser } from '@/shared/types';

const CACHE_KEY = 'zhihu-analyzer-current-user';

export function useCurrentUser(overrideUserId?: string) {
  const [user, setUser] = useState<ZhihuUser | null>(() => {
    // Try loading from sessionStorage for instant display
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  // When we successfully hydrate from cache, skip the loading flicker — the
  // component can render with the cached user immediately while the background
  // refetch updates it in place. Without a cache we still start in a loading
  // state until the first API response comes back.
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(CACHE_KEY) === null;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (overrideUserId) {
      // Look up from saved accounts when an override is specified
      getSavedAccounts()
        .then((accounts) => {
          const found = accounts.find((a) => a.userId === overrideUserId);
          if (found) {
            const u: ZhihuUser = {
              id: found.userId,
              name: found.name,
              urlToken: found.urlToken,
              avatarUrl: found.avatarUrl,
            };
            setUser(u);
          }
        })
        .catch(() => {
          // Keep previous user if lookup fails
        })
        .finally(() => setLoading(false));
    } else {
      // Default: fetch from Zhihu API
      fetchCurrentUser()
        .then((u) => {
          setUser(u);
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
          // Auto-save to savedAccounts. The full getSavedAccounts → saveAccount
          // chain is best-effort — any failure (missing IndexedDB in tests,
          // storage quota, etc.) is swallowed to avoid leaking unhandled
          // rejections up to the caller.
          const now = Date.now();
          getSavedAccounts()
            .then((accounts) => {
              const existing = accounts.find((a) => a.userId === u.id);
              return saveAccount({
                userId: u.id,
                name: u.name,
                urlToken: u.urlToken,
                avatarUrl: u.avatarUrl,
                addedAt: existing?.addedAt ?? now,
                lastUsedAt: now,
              });
            })
            .catch(() => {});
        })
        .catch(() => {
          // Keep cached user if fetch fails
        })
        .finally(() => setLoading(false));
    }
  }, [overrideUserId]);

  return { user, loading };
}
