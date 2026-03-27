import { db } from './database';
import type { IncomeRecord, DailySummary } from '@/shared/types';

export async function upsertIncomeRecords(records: IncomeRecord[]): Promise<void> {
  await db.incomeRecords.bulkPut(records);
}

export async function getRecordsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<IncomeRecord[]> {
  return db.incomeRecords
    .where('[userId+recordDate]')
    .between([userId, startDate], [userId, endDate], true, true)
    .toArray();
}

export async function getDailySummaries(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailySummary[]> {
  const records = await getRecordsByDateRange(userId, startDate, endDate);
  const byDate = new Map<string, { income: number; read: number; interaction: number; count: number }>();
  for (const r of records) {
    const existing = byDate.get(r.recordDate) ?? { income: 0, read: 0, interaction: 0, count: 0 };
    existing.income += r.currentIncome;
    existing.read += r.currentRead;
    existing.interaction += r.currentInteraction;
    existing.count += 1;
    byDate.set(r.recordDate, existing);
  }
  return Array.from(byDate.entries())
    .map(([date, agg]) => ({
      date,
      totalIncome: agg.income,
      totalRead: agg.read,
      totalInteraction: agg.interaction,
      contentCount: agg.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Check if records exist for a specific user+date */
export async function hasRecordsForDate(userId: string, date: string): Promise<boolean> {
  const count = await db.incomeRecords
    .where('[userId+recordDate]')
    .equals([userId, date])
    .count();
  return count > 0;
}

export async function getAllContentIds(): Promise<string[]> {
  const records = await db.incomeRecords.orderBy('contentId').uniqueKeys();
  return records as string[];
}
