import { useState, useEffect, useCallback } from 'react';
import { getRecordsByDateRange, getDailySummaries } from '@/db/income-store';
import type { IncomeRecord, DailySummary } from '@/shared/types';

export function useIncomeData(userId: string, startDate: string, endDate: string) {
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRecords([]);
      setSummaries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [recs, sums] = await Promise.all([
      getRecordsByDateRange(userId, startDate, endDate),
      getDailySummaries(userId, startDate, endDate),
    ]);
    setRecords(recs);
    setSummaries(sums);
    setLoading(false);
  }, [userId, startDate, endDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { records, summaries, loading, refresh };
}
