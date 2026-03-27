import { useState, useEffect } from 'react';
import { fetchCurrentUser } from '@/api/zhihu-income';
import type { ZhihuUser } from '@/shared/types';

const CACHE_KEY = 'zhihu-analyzer-current-user';

export function useCurrentUser() {
  const [user, setUser] = useState<ZhihuUser | null>(() => {
    // Try loading from sessionStorage for instant display
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        setUser(u);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
      })
      .catch(() => {
        // Keep cached user if fetch fails
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
