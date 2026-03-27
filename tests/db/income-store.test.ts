import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  upsertIncomeRecords,
  getRecordsByDateRange,
  getDailySummaries,
  getAllContentIds,
  hasRecordsForDate,
} from '@/db/income-store';
import type { IncomeRecord } from '@/shared/types';

const USER_ID = 'testuser123';

const makeRecord = (overrides: Partial<IncomeRecord> = {}): IncomeRecord => ({
  userId: USER_ID,
  contentId: '100',
  contentToken: 'token100',
  title: 'Test Article',
  contentType: 'answer',
  publishDate: '2026-03-20',
  recordDate: '2026-03-27',
  currentRead: 100,
  currentInteraction: 10,
  currentIncome: 50,
  totalRead: 200,
  totalInteraction: 20,
  totalIncome: 100,
  collectedAt: Date.now(),
  ...overrides,
});

beforeEach(async () => {
  await db.incomeRecords.clear();
});

describe('upsertIncomeRecords', () => {
  it('inserts new records', async () => {
    await upsertIncomeRecords([makeRecord()]);
    const count = await db.incomeRecords.count();
    expect(count).toBe(1);
  });
  it('updates existing record with same userId+contentId+recordDate', async () => {
    await upsertIncomeRecords([makeRecord({ currentRead: 100 })]);
    await upsertIncomeRecords([makeRecord({ currentRead: 200 })]);
    const count = await db.incomeRecords.count();
    expect(count).toBe(1);
    const record = await db.incomeRecords.toArray();
    expect(record[0].currentRead).toBe(200);
  });
});

describe('getRecordsByDateRange', () => {
  it('returns records within the specified date range for user', async () => {
    await upsertIncomeRecords([
      makeRecord({ contentId: '1', recordDate: '2026-03-25' }),
      makeRecord({ contentId: '2', recordDate: '2026-03-26' }),
      makeRecord({ contentId: '3', recordDate: '2026-03-28' }),
      makeRecord({ contentId: '4', recordDate: '2026-03-25', userId: 'other_user' }),
    ]);
    const records = await getRecordsByDateRange(USER_ID, '2026-03-25', '2026-03-26');
    expect(records).toHaveLength(2);
  });
});

describe('getDailySummaries', () => {
  it('aggregates records by date for user', async () => {
    await upsertIncomeRecords([
      makeRecord({ contentId: '1', recordDate: '2026-03-27', currentIncome: 50, currentRead: 100, currentInteraction: 10 }),
      makeRecord({ contentId: '2', recordDate: '2026-03-27', currentIncome: 30, currentRead: 200, currentInteraction: 5 }),
      makeRecord({ contentId: '3', recordDate: '2026-03-26', currentIncome: 20, currentRead: 50, currentInteraction: 3 }),
    ]);
    const summaries = await getDailySummaries(USER_ID, '2026-03-26', '2026-03-27');
    expect(summaries).toHaveLength(2);
    const mar27 = summaries.find((s) => s.date === '2026-03-27')!;
    expect(mar27.totalIncome).toBe(80);
    expect(mar27.totalRead).toBe(300);
    expect(mar27.contentCount).toBe(2);
    const mar26 = summaries.find((s) => s.date === '2026-03-26')!;
    expect(mar26.totalIncome).toBe(20);
  });
});

describe('hasRecordsForDate', () => {
  it('returns true when records exist', async () => {
    await upsertIncomeRecords([makeRecord({ recordDate: '2026-03-27' })]);
    expect(await hasRecordsForDate(USER_ID, '2026-03-27')).toBe(true);
  });
  it('returns false when no records exist', async () => {
    expect(await hasRecordsForDate(USER_ID, '2026-03-27')).toBe(false);
  });
  it('returns false for different user', async () => {
    await upsertIncomeRecords([makeRecord({ recordDate: '2026-03-27' })]);
    expect(await hasRecordsForDate('other_user', '2026-03-27')).toBe(false);
  });
});

describe('getAllContentIds', () => {
  it('returns unique content IDs', async () => {
    await upsertIncomeRecords([
      makeRecord({ contentId: '1', recordDate: '2026-03-26' }),
      makeRecord({ contentId: '1', recordDate: '2026-03-27' }),
      makeRecord({ contentId: '2', recordDate: '2026-03-27' }),
    ]);
    const ids = await getAllContentIds();
    expect(ids.sort()).toEqual(['1', '2']);
  });
});
