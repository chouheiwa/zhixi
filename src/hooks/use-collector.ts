import { useState, useCallback } from 'react';
import { fetchDateRangeIncome, fetchCurrentUser } from '@/api/zhihu-income';
import { upsertIncomeRecords, hasRecordsForDate } from '@/db/income-store';
import type { CollectionStatus, ZhihuUser } from '@/shared/types';

export function useCollector() {
  const [status, setStatus] = useState<CollectionStatus>({
    isCollecting: false,
    progress: 0,
    total: 0,
  });

  const collect = useCallback(async (startDate: string, endDate: string) => {
    setStatus({ isCollecting: true, progress: 0, total: 0 });

    try {
      // Get current user first
      const user: ZhihuUser = await fetchCurrentUser();

      const records = await fetchDateRangeIncome(
        startDate,
        endDate,
        user.id,
        {
          shouldSkipDate: (date) => hasRecordsForDate(user.id, date),
          onProgress: (currentDate, current, total, skipped) => {
            setStatus({
              isCollecting: true,
              progress: current,
              total,
              currentDate: skipped ? `${currentDate} (已跳过)` : currentDate,
            });
          },
        }
      );

      await upsertIncomeRecords(records);
      setStatus({ isCollecting: false, progress: 0, total: 0 });
      return { count: records.length, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : '采集失败';
      setStatus({ isCollecting: false, progress: 0, total: 0, error: message });
      throw err;
    }
  }, []);

  return { status, collect };
}
