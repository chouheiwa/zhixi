import { db } from './database';
import type { ContentDailyRecord } from '@/shared/types';

export async function upsertContentDailyRecords(records: ContentDailyRecord[]): Promise<void> {
  await db.contentDaily.bulkPut(records);
}

export async function getContentDailyRecords(
  userId: string,
  contentToken: string
): Promise<ContentDailyRecord[]> {
  return db.contentDaily
    .where('[userId+contentToken]')
    .equals([userId, contentToken])
    .sortBy('date');
}

export async function getContentDailyLatestDate(
  userId: string,
  contentToken: string
): Promise<string | null> {
  const records = await db.contentDaily
    .where('[userId+contentToken]')
    .equals([userId, contentToken])
    .reverse()
    .limit(1)
    .toArray();
  return records.length > 0 ? records[0].date : null;
}
