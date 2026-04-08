import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '@/db/database';
import { useIncomeData } from '@/hooks/use-income-data';

const mockRecord = (date: string, contentId: string, income: number) => ({
  userId: 'u1',
  contentId,
  contentToken: `token-${contentId}`,
  contentType: 'article' as const,
  title: `Test ${contentId}`,
  publishDate: '2025-01-01',
  recordDate: date,
  currentIncome: income,
  currentRead: 100,
  currentInteraction: 10,
  totalRead: 1000,
  totalInteraction: 50,
  totalIncome: income * 10,
  collectedAt: Date.now(),
});

describe('useIncomeData', () => {
  beforeEach(async () => {
    await db.incomeRecords.clear();
  });

  it('returns empty arrays when no userId', async () => {
    const { result } = renderHook(() => useIncomeData('', '2025-01-01', '2025-01-07'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records).toEqual([]);
    expect(result.current.summaries).toEqual([]);
  });

  it('loads records and summaries for date range', async () => {
    await db.incomeRecords.bulkAdd([
      mockRecord('2025-01-01', 'c1', 100),
      mockRecord('2025-01-02', 'c1', 200),
      mockRecord('2025-01-05', 'c2', 300),
    ]);

    const { result } = renderHook(() => useIncomeData('u1', '2025-01-01', '2025-01-03'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records.length).toBe(2);
    expect(result.current.summaries.length).toBe(2);
    expect(result.current.summaries[0].date).toBe('2025-01-01');
  });

  it('refresh reloads data', async () => {
    const { result } = renderHook(() => useIncomeData('u1', '2025-01-01', '2025-01-07'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records.length).toBe(0);

    await db.incomeRecords.add(mockRecord('2025-01-01', 'c1', 100));
    await result.current.refresh();
    await waitFor(() => expect(result.current.records.length).toBe(1));
  });
});
