import { useState, useEffect, useCallback } from 'react';
import { getRecordsByDateRange, getDailySummaries } from '@/db/income-store';
import type { IncomeRecord, DailySummary } from '@/shared/types';

export function useIncomeData(startDate: string, endDate: string) {
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [recs, sums] = await Promise.all([
      getRecordsByDateRange(startDate, endDate),
      getDailySummaries(startDate, endDate),
    ]);
    setRecords(recs);
    setSummaries(sums);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { records, summaries, loading, refresh };
}
