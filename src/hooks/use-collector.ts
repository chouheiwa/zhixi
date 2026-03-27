import { useState, useCallback } from 'react';
import { fetchDateRangeIncome } from '@/api/zhihu-income';
import { upsertIncomeRecords } from '@/db/income-store';
import type { CollectionStatus } from '@/shared/types';

export function useCollector() {
  const [status, setStatus] = useState<CollectionStatus>({
    isCollecting: false,
    progress: 0,
    total: 0,
  });

  const collect = useCallback(async (startDate: string, endDate: string) => {
    setStatus({ isCollecting: true, progress: 0, total: 0 });

    try {
      const records = await fetchDateRangeIncome(
        startDate,
        endDate,
        (currentDate, current, total) => {
          setStatus({ isCollecting: true, progress: current, total, currentDate });
        }
      );

      await upsertIncomeRecords(records);
      setStatus({ isCollecting: false, progress: 0, total: 0 });
      return records.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : '采集失败';
      setStatus({ isCollecting: false, progress: 0, total: 0, error: message });
      throw err;
    }
  }, []);

  return { status, collect };
}
