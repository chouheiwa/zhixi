import { useState, useEffect, useCallback } from 'react';
import type { CollectionStatus } from '@/shared/types';

interface SyncResult {
  count: number;
  synced: number;
  total: number;
}

export function useCollector() {
  const [status, setStatus] = useState<CollectionStatus>({
    isCollecting: false,
    progress: 0,
    total: 0,
  });

  // Listen for status broadcasts from service worker
  useEffect(() => {
    const listener = (message: { action: string; status: CollectionStatus }) => {
      if (message.action === 'collectStatus') {
        setStatus(message.status);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Get initial status
    chrome.runtime.sendMessage({ action: 'getCollectStatus' }, (response) => {
      if (response && !chrome.runtime.lastError) {
        setStatus(response);
      }
    });

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /**
   * Smart sync: collect all missing dates.
   * Pass startDate on first use to set the collection start date.
   */
  const sync = useCallback((startDate?: string): Promise<SyncResult> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'syncIncome', startDate },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.ok) {
            resolve({ count: response.count, synced: response.synced, total: response.total });
          } else {
            reject(new Error(response?.error ?? '同步失败'));
          }
        }
      );
    });
  }, []);

  return { status, sync };
}
