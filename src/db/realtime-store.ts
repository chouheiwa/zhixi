import { db } from './database';
import type { RealtimeAggrRecord } from '@/shared/types';

export async function upsertRealtimeAggr(records: RealtimeAggrRecord[]): Promise<void> {
  await db.realtimeAggr.bulkPut(records);
}

export async function getRealtimeAggrByDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<RealtimeAggrRecord[]> {
  return db.realtimeAggr
    .where('[userId+date]')
    .between([userId, startDate], [userId, endDate], true, true)
    .sortBy('date');
}

export async function getAllRealtimeAggr(userId: string): Promise<RealtimeAggrRecord[]> {
  return db.realtimeAggr.where('userId').equals(userId).sortBy('date');
}

export async function getRealtimeAggrLatestDate(userId: string): Promise<string | null> {
  const records = await db.realtimeAggr.where('userId').equals(userId).reverse().sortBy('date');
  return records.length > 0 ? records[0].date : null;
}

export async function getRealtimeAggrForDate(userId: string, date: string): Promise<RealtimeAggrRecord | undefined> {
  return db.realtimeAggr.get([userId, date]);
}
