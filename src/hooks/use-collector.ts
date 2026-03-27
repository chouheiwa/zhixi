import { useState, useEffect, useCallback } from 'react';
import type { CollectionStatus } from '@/shared/types';

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

  const collect = useCallback((startDate: string, endDate: string): Promise<{ count: number }> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'startCollect', startDate, endDate },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.ok) {
            resolve({ count: response.count });
          } else {
            reject(new Error(response?.error ?? '采集失败'));
          }
        }
      );
    });
  }, []);

  return { status, collect };
}
