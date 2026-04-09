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
  const [loading, setLoading] = useState(true);

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
          // Auto-save to savedAccounts
          const now = Date.now();
          getSavedAccounts().then((accounts) => {
            const existing = accounts.find((a) => a.userId === u.id);
            saveAccount({
              userId: u.id,
              name: u.name,
              urlToken: u.urlToken,
              avatarUrl: u.avatarUrl,
              addedAt: existing?.addedAt ?? now,
              lastUsedAt: now,
            }).catch(() => {});
          });
        })
        .catch(() => {
          // Keep cached user if fetch fails
        })
        .finally(() => setLoading(false));
    }
  }, [overrideUserId]);

  return { user, loading };
}
