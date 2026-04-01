import { useState, useEffect, useCallback } from 'react';
import type {
  BroadcastMessage,
  ContentCollectionItem,
  GetCollectStatusResponse,
  MessageAction,
  RequestOf,
  ResponseOf,
} from '@/shared/message-types';
import type { CollectionStatus } from '@/shared/types';

interface SyncResult {
  count: number;
  synced: number;
  total: number;
}

interface FetchResult {
  count: number;
}

type CollectorAction =
  | Extract<MessageAction, 'syncIncome'>
  | Extract<MessageAction, 'syncRealtimeAggr'>
  | Extract<MessageAction, 'fetchContentDaily'>
  | Extract<MessageAction, 'fetchAllCreations'>
  | Extract<MessageAction, 'fetchTodayContentDaily'>
  | Extract<MessageAction, 'fetchTodayRealtime'>;

function sendMsg<TAction extends CollectorAction>(message: RequestOf<TAction>): Promise<ResponseOf<TAction>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ResponseOf<TAction>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && typeof response === 'object' && 'ok' in response) {
        if (response.ok) {
          resolve(response);
          return;
        }

        reject(new Error(response.error ?? '操作失败'));
        return;
      }

      reject(new Error('操作失败'));
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
    const listener = (message: BroadcastMessage) => {
      if (message.action === 'collectStatus') {
        setStatus(message.status);
        if (message.status.logs) {
          setLogs(message.status.logs);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage(
      { action: 'getCollectStatus' } satisfies RequestOf<'getCollectStatus'>,
      (response?: GetCollectStatusResponse) => {
        if (response && !chrome.runtime.lastError) {
          setStatus(response);
          if (response.logs) setLogs(response.logs);
        }
      },
    );

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /** 收益同步 */
  const syncIncome = useCallback((startDate?: string): Promise<SyncResult> => {
    return sendMsg({ action: 'syncIncome', startDate }).then(({ count, synced, total }) => ({
      count,
      synced,
      total,
    }));
  }, []);

  /** 每日汇总 */
  const syncRealtimeAggr = useCallback((): Promise<FetchResult> => {
    return sendMsg({ action: 'syncRealtimeAggr' }).then(({ count }) => ({ count }));
  }, []);

  /** 内容详情（需传入内容列表） */
  const fetchContentDaily = useCallback((items: ContentCollectionItem[]): Promise<FetchResult> => {
    return sendMsg({ action: 'fetchContentDaily', items }).then(({ count }) => ({ count }));
  }, []);

  /** 获取全部已发表内容列表 */
  const fetchAllCreations = useCallback((): Promise<ContentCollectionItem[]> => {
    return sendMsg({ action: 'fetchAllCreations' }).then((resp) => resp.items ?? []);
  }, []);

  /** 今日内容数据 */
  const fetchTodayContentDaily = useCallback((): Promise<{ count: number; cached: number }> => {
    return sendMsg({ action: 'fetchTodayContentDaily' }).then(({ count, cached }) => ({ count, cached }));
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
