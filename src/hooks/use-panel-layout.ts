import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/db/database';
import { getDefaultTabs } from '@/dashboard/panel-registry';
import type { PanelLayout, TabConfig } from '@/shared/types';

export function usePanelLayout(userId: string) {
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = userId ? await db.panelLayout.get(userId) : null;
      if (cancelled) return;
      if (!userId) {
        setLayout(null);
      } else if (saved) {
        const defaults = getDefaultTabs();
        const merged = mergeWithDefaults(saved.tabs, defaults);
        setLayout({ userId, tabs: merged });
      } else {
        setLayout({ userId, tabs: getDefaultTabs() });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateLayout = useCallback(
    (tabs: TabConfig[]) => {
      if (!userId) return;
      const newLayout: PanelLayout = { userId, tabs };
      setLayout(newLayout);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        db.panelLayout.put(newLayout);
      }, 500);
    },
    [userId],
  );

  const resetLayout = useCallback(async () => {
    if (!userId) return;
    const defaults: PanelLayout = { userId, tabs: getDefaultTabs() };
    setLayout(defaults);
    await db.panelLayout.put(defaults);
  }, [userId]);

  return { layout, loading, updateLayout, resetLayout };
}

function mergeWithDefaults(saved: TabConfig[], defaults: TabConfig[]): TabConfig[] {
  const defaultTabMap = new Map(defaults.map((t) => [t.key, t]));
  const savedTabKeys = new Set(saved.map((t) => t.key));

  const merged = saved
    .filter((t) => defaultTabMap.has(t.key))
    .map((savedTab) => {
      const defaultTab = defaultTabMap.get(savedTab.key)!;
      const defaultPanelMap = new Map(defaultTab.panels.map((p) => [p.key, p]));
      const savedPanelKeys = new Set(savedTab.panels.map((p) => p.key));

      const mergedPanels = [
        ...savedTab.panels.filter((p) => defaultPanelMap.has(p.key)),
        ...defaultTab.panels.filter((p) => !savedPanelKeys.has(p.key)),
      ];

      return { ...savedTab, panels: mergedPanels };
    });

  for (const dt of defaults) {
    if (!savedTabKeys.has(dt.key)) {
      merged.push({ ...dt, order: merged.length });
    }
  }

  return merged;
}
