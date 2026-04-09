import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import type { TabConfig } from '@/shared/types';

const mockDefaultTabs: TabConfig[] = [
  {
    key: 'overview',
    label: '总览',
    visible: true,
    order: 0,
    panels: [
      { key: 'dailyTrend', visible: true, order: 0 },
      { key: 'rpm', visible: true, order: 1 },
    ],
  },
  {
    key: 'ml',
    label: '智能分析',
    visible: true,
    order: 1,
    panels: [{ key: 'mlPrediction', visible: true, order: 0 }],
  },
];

vi.mock('@/dashboard/panel-registry', () => ({
  getDefaultTabs: vi.fn(() => mockDefaultTabs),
}));

import { db } from '@/db/database';
import { usePanelLayout } from '@/hooks/use-panel-layout';

describe('usePanelLayout', () => {
  beforeEach(async () => {
    await db.panelLayout.clear();
  });

  it('returns default layout when no saved layout exists', async () => {
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.layout).toEqual({
      userId: 'u1',
      tabs: mockDefaultTabs,
    });
  });

  it('returns null layout when userId is empty', async () => {
    const { result } = renderHook(() => usePanelLayout(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.layout).toBeNull();
  });

  it('updateLayout updates state with new tabs', async () => {
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedTabs: TabConfig[] = [
      {
        key: 'overview',
        label: '总览',
        visible: false,
        order: 0,
        panels: [{ key: 'dailyTrend', visible: false, order: 0 }],
      },
    ];

    act(() => {
      result.current.updateLayout(updatedTabs);
    });

    await waitFor(() => {
      expect(result.current.layout).toEqual({
        userId: 'u1',
        tabs: updatedTabs,
      });
    });
  });

  it('loads and merges saved layout when one exists', async () => {
    // Pre-save a layout with some tabs that match defaults (and one new default tab not in saved)
    const savedTabs: TabConfig[] = [
      {
        key: 'overview',
        label: '总览',
        visible: false, // different from default
        order: 0,
        panels: [
          { key: 'dailyTrend', visible: false, order: 0 },
          // 'rpm' is in default but not saved → should be merged in
        ],
      },
      // 'ml' tab is in default but not in saved → should be added
    ];

    await db.panelLayout.put({ userId: 'u1', tabs: savedTabs });

    const { result } = renderHook(() => usePanelLayout('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const layout = result.current.layout;
    expect(layout).not.toBeNull();
    expect(layout?.userId).toBe('u1');
    // Both 'overview' and 'ml' tabs should exist (ml was added from defaults)
    const tabKeys = layout?.tabs.map((t) => t.key);
    expect(tabKeys).toContain('overview');
    expect(tabKeys).toContain('ml');

    // overview tab should have both dailyTrend (saved) and rpm (merged from default)
    const overviewTab = layout?.tabs.find((t) => t.key === 'overview');
    const panelKeys = overviewTab?.panels.map((p) => p.key);
    expect(panelKeys).toContain('dailyTrend');
    expect(panelKeys).toContain('rpm');
  });

  it('updateLayout with empty userId does nothing', async () => {
    const { result } = renderHook(() => usePanelLayout(''));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const initialLayout = result.current.layout;
    act(() => {
      result.current.updateLayout([]);
    });

    // Layout should remain unchanged since userId is empty
    expect(result.current.layout).toBe(initialLayout);
  });

  it('resetLayout with empty userId does nothing', async () => {
    const { result } = renderHook(() => usePanelLayout(''));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(result.current.layout).toBeNull();
  });

  it('resetLayout restores default layout', async () => {
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // First update to a custom layout
    const customTabs: TabConfig[] = [
      {
        key: 'overview',
        label: '总览',
        visible: false,
        order: 0,
        panels: [],
      },
    ];

    act(() => {
      result.current.updateLayout(customTabs);
    });

    await waitFor(() => expect(result.current.layout?.tabs).toEqual(customTabs));

    // Then reset
    await act(async () => {
      await result.current.resetLayout();
    });

    await waitFor(() => {
      expect(result.current.layout).toEqual({
        userId: 'u1',
        tabs: mockDefaultTabs,
      });
    });
  });
});
