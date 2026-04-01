import { useState, useEffect, useCallback, useRef } from 'react';
import type { CollectionStatus } from '@/shared/types';

interface SyncResult {
  count: number;
  synced: number;
  total: number;
}

interface FetchResult {
  count: number;
}

function sendMsg<T = Record<string, unknown>>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.ok) {
        resolve(response as T);
      } else {
        reject(new Error(response?.error ?? '操作失败'));
      }
    });
  });
}

export function useCollector() {
  const [status, setStatus] = useState<CollectionStatus>({
    isCollecting: false,
    progress: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const listener = (message: { action: string; status: CollectionStatus }) => {
      if (message.action === 'collectStatus') {
        setStatus(message.status);
        if (message.status.logs) {
          setLogs(message.status.logs);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({ action: 'getCollectStatus' }, (response) => {
      if (response && !chrome.runtime.lastError) {
        setStatus(response);
        if (response.logs) setLogs(response.logs);
      }
    });

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /** 收益同步 */
  const syncIncome = useCallback((startDate?: string): Promise<SyncResult> => {
    return sendMsg<SyncResult & { ok: boolean }>({ action: 'syncIncome', startDate }).then(
      ({ count, synced, total }) => ({ count, synced, total }),
    );
  }, []);

  /** 每日汇总 */
  const syncRealtimeAggr = useCallback((): Promise<FetchResult> => {
    return sendMsg<FetchResult & { ok: boolean }>({ action: 'syncRealtimeAggr' }).then(({ count }) => ({ count }));
  }, []);

  /** 内容详情（需传入内容列表） */
  const fetchContentDaily = useCallback(
    (
      items: Array<{
        contentId: string;
        contentToken: string;
        contentType: string;
        title: string;
        publishDate: string;
      }>,
    ): Promise<FetchResult> => {
      return sendMsg<FetchResult & { ok: boolean }>({ action: 'fetchContentDaily', items }).then(({ count }) => ({
        count,
      }));
    },
    [],
  );

  /** 获取全部已发表内容列表 */
  const fetchAllCreations = useCallback((): Promise<
    Array<{
      contentId: string;
      contentToken: string;
      contentType: string;
      title: string;
      publishDate: string;
    }>
  > => {
    return sendMsg<{ ok: boolean; items: any[] }>({ action: 'fetchAllCreations' }).then((resp) => resp.items ?? []);
  }, []);

  /** 今日内容数据 */
  const fetchTodayContentDaily = useCallback((): Promise<{ count: number; cached: number }> => {
    return sendMsg<{ ok: boolean; count: number; cached: number }>({ action: 'fetchTodayContentDaily' }).then(
      ({ count, cached }) => ({ count, cached }),
    );
  }, []);

  /** 今日实时汇总 */
  const fetchTodayRealtime = useCallback((): Promise<void> => {
    return sendMsg({ action: 'fetchTodayRealtime' }).then(() => {});
  }, []);

  // Keep backward-compatible `sync` alias
  const sync = syncIncome;

  return {
    status,
    logs,
    sync,
    syncIncome,
    syncRealtimeAggr,
    fetchContentDaily,
    fetchAllCreations,
    fetchTodayContentDaily,
    fetchTodayRealtime,
  };
}
