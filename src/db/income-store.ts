import { db } from './database';
import type { IncomeRecord, DailySummary, UserSettings } from '@/shared/types';

export async function upsertIncomeRecords(records: IncomeRecord[]): Promise<void> {
  await db.incomeRecords.bulkPut(records);
}

export async function getRecordsByDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<IncomeRecord[]> {
  return db.incomeRecords
    .where('[userId+recordDate]')
    .between([userId, startDate], [userId, endDate], true, true)
    .toArray();
}

export async function getDailySummaries(userId: string, startDate: string, endDate: string): Promise<DailySummary[]> {
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

/** Get ALL daily summaries for a user (no date filter) */
export async function getAllDailySummaries(userId: string): Promise<DailySummary[]> {
  // Use compound index [userId+recordDate] for pre-sorted iteration, avoiding post-sort
  const records = await db.incomeRecords
    .where('[userId+recordDate]')
    .between([userId, ''], [userId, '\uffff'])
    .toArray();
  const byDate = new Map<string, { income: number; read: number; interaction: number; count: number }>();
  for (const r of records) {
    const existing = byDate.get(r.recordDate) ?? { income: 0, read: 0, interaction: 0, count: 0 };
    existing.income += r.currentIncome;
    existing.read += r.currentRead;
    existing.interaction += r.currentInteraction;
    existing.count += 1;
    byDate.set(r.recordDate, existing);
  }
  // Records are already sorted by recordDate from the compound index, so Map preserves order
  return Array.from(byDate.entries()).map(([date, agg]) => ({
    date,
    totalIncome: agg.income,
    totalRead: agg.read,
    totalInteraction: agg.interaction,
    contentCount: agg.count,
  }));
}

/** Check if records exist for a specific user+date */
export async function hasRecordsForDate(userId: string, date: string): Promise<boolean> {
  const count = await db.incomeRecords.where('[userId+recordDate]').equals([userId, date]).count();
  return count > 0;
}

/** Get all dates that have records for a user */
export async function getCollectedDates(userId: string): Promise<Set<string>> {
  const records = await db.incomeRecords.where('userId').equals(userId).toArray();
  return new Set(records.map((r) => r.recordDate));
}

/** Mark a date as synced (even if no data returned) */
export async function markDateSynced(userId: string, date: string): Promise<void> {
  await db.syncedDates.put({ userId, date, syncedAt: Date.now() });
}

/** Mark multiple dates as synced */
export async function markDatesSynced(userId: string, dates: string[]): Promise<void> {
  const now = Date.now();
  await db.syncedDates.bulkPut(dates.map((date) => ({ userId, date, syncedAt: now })));
}

/** Get all synced dates for a user */
export async function getSyncedDates(userId: string): Promise<Set<string>> {
  const records = await db.syncedDates.where('userId').equals(userId).toArray();
  return new Set(records.map((r) => r.date));
}

/**
 * Get missing dates between startDate and yesterday for a user.
 * - Dates older than 3 days: skip if already synced (even if no data)
 * - Dates within last 3 days: always re-fetch (data may still update)
 */
export async function getMissingDates(userId: string, startDate: string): Promise<string[]> {
  const { eachDayInRange, formatDate } = await import('@/shared/date-utils');
  const yesterday = formatDate(
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    })(),
  );

  if (startDate > yesterday) return [];

  const threeDaysAgo = formatDate(
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      return d;
    })(),
  );

  const allDays = eachDayInRange(startDate, yesterday);
  const synced = await getSyncedDates(userId);

  return allDays
    .filter((d) => {
      if (d >= threeDaysAgo) {
        // Recent dates (within 3 days): always re-fetch
        return true;
      }
      // Older dates: skip if already synced
      return !synced.has(d);
    })
    .reverse(); // newest first
}

export async function getAllContentIds(): Promise<string[]> {
  const records = await db.incomeRecords.orderBy('contentId').uniqueKeys();
  return records as string[];
}

// ============ User Settings ============

export async function getUserSettings(userId: string): Promise<UserSettings | undefined> {
  return db.userSettings.get(userId);
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  await db.userSettings.put(settings);
}
