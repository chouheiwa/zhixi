import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollector } from '@/hooks/use-collector';

describe('useCollector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockReset();
    (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockReset();
    (chrome.runtime.onMessage.removeListener as ReturnType<typeof vi.fn>).mockReset();
  });

  it('initializes with default status', () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb?: (resp: unknown) => void) => {
        cb?.({ isCollecting: false, progress: 0, total: 0 });
      },
    );
    const { result } = renderHook(() => useCollector());
    expect(result.current.status.isCollecting).toBe(false);
    expect(result.current.logs).toEqual([]);
  });

  it('syncIncome sends message and returns result', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (msg: Record<string, unknown>, cb?: (resp: unknown) => void) => {
        if (msg.action === 'syncIncome') {
          cb?.({ ok: true, count: 10, synced: 5, total: 10 });
        } else {
          cb?.({ isCollecting: false, progress: 0, total: 0 });
        }
      },
    );
    const { result } = renderHook(() => useCollector());
    let syncResult: { count: number; synced: number; total: number } | undefined;
    await act(async () => {
      syncResult = await result.current.syncIncome();
    });
    expect(syncResult).toEqual({ count: 10, synced: 5, total: 10 });
  });

  it('syncIncome rejects on error response', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (msg: Record<string, unknown>, cb?: (resp: unknown) => void) => {
        if (msg.action === 'syncIncome') {
          cb?.({ ok: false, error: '同步失败' });
        } else {
          cb?.({ isCollecting: false, progress: 0, total: 0 });
        }
      },
    );
    const { result } = renderHook(() => useCollector());
    await expect(act(() => result.current.syncIncome())).rejects.toThrow('同步失败');
  });

  it('syncRealtimeAggr returns count', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (msg: Record<string, unknown>, cb?: (resp: unknown) => void) => {
        if (msg.action === 'syncRealtimeAggr') {
          cb?.({ ok: true, count: 7 });
        } else {
          cb?.({ isCollecting: false, progress: 0, total: 0 });
        }
      },
    );
    const { result } = renderHook(() => useCollector());
    let fetchResult: { count: number } | undefined;
    await act(async () => {
      fetchResult = await result.current.syncRealtimeAggr();
    });
    expect(fetchResult).toEqual({ count: 7 });
  });

  it('updates status on collectStatus broadcast', async () => {
    let messageListener: ((msg: Record<string, unknown>) => void) | undefined;
    (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (msg: Record<string, unknown>) => void) => {
        messageListener = fn;
      },
    );
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb?: (resp: unknown) => void) => {
        cb?.({ isCollecting: false, progress: 0, total: 0 });
      },
    );

    const { result } = renderHook(() => useCollector());
    expect(result.current.status.isCollecting).toBe(false);

    act(() => {
      messageListener?.({
        action: 'collectStatus',
        status: { isCollecting: true, progress: 3, total: 10, task: '收益同步', logs: ['开始同步'] },
      });
    });

    expect(result.current.status.isCollecting).toBe(true);
    expect(result.current.status.progress).toBe(3);
    expect(result.current.logs).toEqual(['开始同步']);
  });
});
