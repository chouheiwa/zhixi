import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  upsertRealtimeAggr,
  getRealtimeAggrByDateRange,
  getAllRealtimeAggr,
  getRealtimeAggrLatestDate,
  getRealtimeAggrForDate,
} from '@/db/realtime-store';
import type { RealtimeAggrRecord } from '@/shared/types';

const USER_ID = 'testuser123';
const OTHER_USER = 'other_user';

const makeRecord = (overrides: Partial<RealtimeAggrRecord> = {}): RealtimeAggrRecord => ({
  userId: USER_ID,
  date: '2026-03-27',
  updatedAt: '2026-03-27T12:00:00Z',
  pv: 100,
  play: 0,
  show: 200,
  upvote: 10,
  comment: 5,
  like: 8,
  collect: 3,
  share: 2,
  reaction: 1,
  rePin: 0,
  likeAndReaction: 9,
  newUpvote: 2,
  newLike: 1,
  newIncrUpvoteNum: 3,
  newDescUpvoteNum: 1,
  newIncrLikeNum: 2,
  newDescLikeNum: 1,
  collectedAt: Date.now(),
  ...overrides,
});

beforeEach(async () => {
  await db.realtimeAggr.clear();
});

describe('upsertRealtimeAggr', () => {
  it('inserts new records', async () => {
    await upsertRealtimeAggr([makeRecord()]);
    expect(await db.realtimeAggr.count()).toBe(1);
  });

  it('upserts existing records with same compound key', async () => {
    await upsertRealtimeAggr([makeRecord({ pv: 100 })]);
    await upsertRealtimeAggr([makeRecord({ pv: 999 })]);
    expect(await db.realtimeAggr.count()).toBe(1);
    const records = await db.realtimeAggr.toArray();
    expect(records[0].pv).toBe(999);
  });

  it('inserts multiple records in bulk', async () => {
    await upsertRealtimeAggr([
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-26' }),
      makeRecord({ date: '2026-03-27' }),
    ]);
    expect(await db.realtimeAggr.count()).toBe(3);
  });
});

describe('getRealtimeAggrByDateRange', () => {
  beforeEach(async () => {
    await upsertRealtimeAggr([
      makeRecord({ date: '2026-03-24' }),
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-26' }),
      makeRecord({ date: '2026-03-27' }),
      makeRecord({ date: '2026-03-28' }),
      makeRecord({ userId: OTHER_USER, date: '2026-03-26' }),
    ]);
  });

  it('returns records within the date range (inclusive)', async () => {
    const records = await getRealtimeAggrByDateRange(USER_ID, '2026-03-25', '2026-03-27');
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.date)).toEqual(['2026-03-25', '2026-03-26', '2026-03-27']);
  });

  it('excludes records outside the date range', async () => {
    const records = await getRealtimeAggrByDateRange(USER_ID, '2026-03-26', '2026-03-26');
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe('2026-03-26');
  });

  it('does not return records for other users', async () => {
    const records = await getRealtimeAggrByDateRange(USER_ID, '2026-03-24', '2026-03-28');
    expect(records.every((r) => r.userId === USER_ID)).toBe(true);
    expect(records).toHaveLength(5);
  });

  it('returns empty array when no records match the range', async () => {
    const records = await getRealtimeAggrByDateRange(USER_ID, '2026-04-01', '2026-04-30');
    expect(records).toHaveLength(0);
  });
});

describe('getRealtimeAggrLatestDate', () => {
  it('returns the latest date for a userId', async () => {
    await upsertRealtimeAggr([
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-27' }),
      makeRecord({ date: '2026-03-26' }),
    ]);
    const latest = await getRealtimeAggrLatestDate(USER_ID);
    expect(latest).toBe('2026-03-27');
  });

  it('returns null when no records exist', async () => {
    const latest = await getRealtimeAggrLatestDate(USER_ID);
    expect(latest).toBeNull();
  });

  it('does not mix records from different users', async () => {
    await upsertRealtimeAggr([
      makeRecord({ userId: OTHER_USER, date: '2026-03-29' }),
      makeRecord({ userId: USER_ID, date: '2026-03-20' }),
    ]);
    const latest = await getRealtimeAggrLatestDate(USER_ID);
    expect(latest).toBe('2026-03-20');
  });
});

describe('getRealtimeAggrForDate', () => {
  it('returns the record for a specific date', async () => {
    const record = makeRecord({ date: '2026-03-27', pv: 42 });
    await upsertRealtimeAggr([record]);
    const result = await getRealtimeAggrForDate(USER_ID, '2026-03-27');
    expect(result).toEqual(record);
  });

  it('returns undefined when no record exists for the date', async () => {
    const result = await getRealtimeAggrForDate(USER_ID, '2026-03-27');
    expect(result).toBeUndefined();
  });

  it('does not return records for other users', async () => {
    await upsertRealtimeAggr([makeRecord({ userId: OTHER_USER, date: '2026-03-27' })]);
    const result = await getRealtimeAggrForDate(USER_ID, '2026-03-27');
    expect(result).toBeUndefined();
  });
});

describe('getAllRealtimeAggr', () => {
  it('returns all records for a userId sorted by date', async () => {
    await upsertRealtimeAggr([
      makeRecord({ date: '2026-03-27' }),
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-26' }),
      makeRecord({ userId: OTHER_USER, date: '2026-03-27' }),
    ]);
    const records = await getAllRealtimeAggr(USER_ID);
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.date)).toEqual(['2026-03-25', '2026-03-26', '2026-03-27']);
  });

  it('returns empty array when no records exist for userId', async () => {
    await upsertRealtimeAggr([makeRecord({ userId: OTHER_USER, date: '2026-03-27' })]);
    const records = await getAllRealtimeAggr(USER_ID);
    expect(records).toHaveLength(0);
  });
});
