import { useState, useEffect, useCallback } from 'react';
import { getUserSettings } from '@/db/income-store';
import type { UserSettings } from '@/shared/types';

export function useUserSettings(userId: string) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSettings(null);
      setLoading(false);
      return;
    }
    const s = await getUserSettings(userId);
    setSettings(s ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = userId ? await getUserSettings(userId) : null;
      if (cancelled) return;
      setSettings(s ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { settings, loading, refresh };
}
