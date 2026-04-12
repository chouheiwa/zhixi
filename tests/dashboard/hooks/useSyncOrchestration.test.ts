import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/db/database', () => ({
  db: {
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
  },
}));

vi.mock('@/db/export-import', () => ({
  exportToJSON: vi.fn(() => Promise.resolve('{"test":true}')),
  importFromJSON: vi.fn(() => Promise.resolve({ imported: 5 })),
}));

import { useSyncOrchestration } from '@/dashboard/hooks/useSyncOrchestration';

function makeCollectorMock() {
  return {
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(() => Promise.resolve({ count: 0, synced: 0, total: 0 })),
    syncIncome: vi.fn(() => Promise.resolve({ count: 10, synced: 5, total: 5 })),
    syncRealtimeAggr: vi.fn(() => Promise.resolve({ count: 3 })),
    fetchContentDaily: vi.fn(() => Promise.resolve({ count: 20 })),
    fetchAllCreations: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
    fetchTodayContentDaily: vi.fn(() => Promise.resolve({ count: 5, cached: 0 })),
    fetchTodayRealtime: vi.fn(() => Promise.resolve({ today: null })),
    logs: [],
  };
}

describe('useSyncOrchestration', () => {
  const refresh = vi.fn();
  const refreshSettings = vi.fn();
  const refreshAllSummaries = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    expect(result.current.syncMsg).toBe('');
    expect(result.current.importMsg).toBe('');
    expect(result.current.setupDate).toBe('');
    expect(result.current.setupOpen).toBe(false);
    expect(typeof result.current.handleSyncIncome).toBe('function');
    expect(typeof result.current.handleSyncAll).toBe('function');
  });

  it('handleSyncIncome calls syncIncome and sets message', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncIncome();
    });

    expect(collector.syncIncome).toHaveBeenCalled();
    expect(result.current.syncMsg).toContain('5 天');
    expect(refresh).toHaveBeenCalled();
    expect(refreshAllSummaries).toHaveBeenCalled();
  });

  it('handleSyncIncome with initDate closes setup', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: false,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncIncome('2024-01-01');
    });

    expect(collector.syncIncome).toHaveBeenCalledWith('2024-01-01');
    expect(refreshSettings).toHaveBeenCalled();
  });

  it('handleSyncIncome handles error', async () => {
    const collector = makeCollectorMock();
    collector.syncIncome.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncIncome();
    });

    expect(result.current.syncMsg).toContain('失败');
  });

  it('handleSyncRealtimeAggr works', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncRealtimeAggr();
    });

    expect(collector.syncRealtimeAggr).toHaveBeenCalled();
    expect(result.current.syncMsg).toContain('3 天');
  });

  it('handleSyncRealtimeAggr shows up-to-date message when count=0', async () => {
    const collector = makeCollectorMock();
    collector.syncRealtimeAggr.mockResolvedValue({ count: 0 });
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncRealtimeAggr();
    });

    expect(result.current.syncMsg).toContain('最新');
  });

  it('handleFetchContentDaily works', async () => {
    const collector = makeCollectorMock();
    collector.fetchAllCreations.mockResolvedValue([
      { contentId: 'c1', contentToken: 't1', contentType: 'article', title: 'A1', publishDate: '2024-01-01' },
    ]);
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleFetchContentDaily();
    });

    expect(collector.fetchContentDaily).toHaveBeenCalled();
    expect(result.current.syncMsg).toContain('完成');
  });

  it('handleFetchContentDaily handles empty items', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleFetchContentDaily();
    });

    expect(result.current.syncMsg).toContain('没有找到');
  });

  it('handleFetchTodayData works', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleFetchTodayData();
    });

    expect(collector.fetchTodayRealtime).toHaveBeenCalled();
    expect(collector.fetchTodayContentDaily).toHaveBeenCalled();
    expect(result.current.syncMsg).toContain('完成');
  });

  it('handleFetchTodayData shows cached message', async () => {
    const collector = makeCollectorMock();
    collector.fetchTodayContentDaily.mockResolvedValue({ count: 0, cached: 10 });
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleFetchTodayData();
    });

    expect(result.current.syncMsg).toContain('缓存');
  });

  it('handleSyncAll runs all sync tasks', async () => {
    const collector = makeCollectorMock();
    collector.fetchAllCreations.mockResolvedValue([
      { contentId: 'c1', contentToken: 't1', contentType: 'article', title: 'A', publishDate: '2024-01-01' },
    ]);
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleSyncAll();
    });

    expect(collector.syncIncome).toHaveBeenCalled();
    expect(collector.syncRealtimeAggr).toHaveBeenCalled();
    expect(collector.fetchContentDaily).toHaveBeenCalled();
    expect(collector.fetchTodayRealtime).toHaveBeenCalled();
    expect(collector.fetchTodayContentDaily).toHaveBeenCalled();
    expect(result.current.syncMsg).toBe('全部同步完成');
  });

  it('handleExport calls exportToJSON', async () => {
    const collector = makeCollectorMock();
    const { result } = renderHook(() =>
      useSyncOrchestration({
        collector: collector as never,
        userId: 'user-1',
        hasSetup: true,
        refreshSettings,
        refresh,
        refreshAllSummaries,
      }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    const { exportToJSON } = await import('@/db/export-import');
    expect(exportToJSON).toHaveBeenCalled();
  });
});
