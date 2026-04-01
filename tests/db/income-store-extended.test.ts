import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/database';
import {
  getAllDailySummaries,
  getMissingDates,
  getSyncedDates,
  markDateSynced,
  markDatesSynced,
  upsertIncomeRecords,
} from '@/db/income-store';
import type { IncomeRecord } from '@/shared/types';

const USER_ID = 'extended-user';

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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-30T08:00:00.000Z'));
  await db.incomeRecords.clear();
  await db.syncedDates.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getMissingDates', () => {
  it('returns only missing older dates, but always includes the latest 3 days', async () => {
    await markDatesSynced(USER_ID, ['2026-03-24', '2026-03-25', '2026-03-27', '2026-03-28', '2026-03-29']);

    await expect(getMissingDates(USER_ID, '2026-03-24')).resolves.toEqual([
      '2026-03-29',
      '2026-03-28',
      '2026-03-27',
      '2026-03-26',
    ]);
  });

  it('returns an empty array when startDate is later than yesterday', async () => {
    await expect(getMissingDates(USER_ID, '2026-03-30')).resolves.toEqual([]);
  });
});

describe('getAllDailySummaries', () => {
  it('returns an empty array when no records exist', async () => {
    await expect(getAllDailySummaries(USER_ID)).resolves.toEqual([]);
  });

  it('aggregates multiple days and sorts summaries ascending by date', async () => {
    await upsertIncomeRecords([
      makeRecord({
        contentId: '1',
        recordDate: '2026-03-29',
        currentIncome: 40,
        currentRead: 100,
        currentInteraction: 4,
      }),
      makeRecord({
        contentId: '2',
        recordDate: '2026-03-27',
        currentIncome: 20,
        currentRead: 80,
        currentInteraction: 2,
      }),
      makeRecord({
        contentId: '3',
        recordDate: '2026-03-27',
        currentIncome: 35,
        currentRead: 120,
        currentInteraction: 5,
      }),
    ]);

    await expect(getAllDailySummaries(USER_ID)).resolves.toEqual([
      {
        date: '2026-03-27',
        totalIncome: 55,
        totalRead: 200,
        totalInteraction: 7,
        contentCount: 2,
      },
      {
        date: '2026-03-29',
        totalIncome: 40,
        totalRead: 100,
        totalInteraction: 4,
        contentCount: 1,
      },
    ]);
  });
});

describe('synced date helpers', () => {
  it('markDateSynced stores a single synced date', async () => {
    await markDateSynced(USER_ID, '2026-03-25');

    await expect(getSyncedDates(USER_ID)).resolves.toEqual(new Set(['2026-03-25']));
  });

  it('markDatesSynced stores multiple synced dates', async () => {
    await markDatesSynced(USER_ID, ['2026-03-25', '2026-03-26']);

    await expect(getSyncedDates(USER_ID)).resolves.toEqual(new Set(['2026-03-25', '2026-03-26']));
  });
});
