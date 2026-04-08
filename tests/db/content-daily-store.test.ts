import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { upsertContentDailyRecords, getContentDailyRecords, getContentDailyLatestDate } from '@/db/content-daily-store';
import type { ContentDailyRecord } from '@/shared/types';

const USER_ID = 'testuser123';
const OTHER_USER = 'other_user';
const TOKEN_A = 'token-a';
const TOKEN_B = 'token-b';

const makeRecord = (overrides: Partial<ContentDailyRecord> = {}): ContentDailyRecord => ({
  userId: USER_ID,
  contentToken: TOKEN_A,
  contentId: 'content-1',
  contentType: 'answer',
  title: 'Test Content',
  date: '2026-03-27',
  pv: 100,
  show: 200,
  upvote: 10,
  comment: 5,
  like: 8,
  collect: 3,
  share: 2,
  play: 0,
  collectedAt: Date.now(),
  ...overrides,
});

beforeEach(async () => {
  await db.contentDaily.clear();
});

describe('upsertContentDailyRecords', () => {
  it('inserts new records', async () => {
    await upsertContentDailyRecords([makeRecord()]);
    const count = await db.contentDaily.count();
    expect(count).toBe(1);
  });

  it('upserts existing records with same compound key', async () => {
    await upsertContentDailyRecords([makeRecord({ pv: 100 })]);
    await upsertContentDailyRecords([makeRecord({ pv: 200 })]);
    const count = await db.contentDaily.count();
    expect(count).toBe(1);
    const records = await db.contentDaily.toArray();
    expect(records[0].pv).toBe(200);
  });

  it('inserts multiple records in bulk', async () => {
    await upsertContentDailyRecords([
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-26' }),
      makeRecord({ date: '2026-03-27' }),
    ]);
    expect(await db.contentDaily.count()).toBe(3);
  });
});

describe('getContentDailyRecords', () => {
  it('returns records sorted by date ascending', async () => {
    await upsertContentDailyRecords([
      makeRecord({ date: '2026-03-27' }),
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-26' }),
    ]);
    const records = await getContentDailyRecords(USER_ID, TOKEN_A);
    expect(records).toHaveLength(3);
    expect(records[0].date).toBe('2026-03-25');
    expect(records[1].date).toBe('2026-03-26');
    expect(records[2].date).toBe('2026-03-27');
  });

  it('filters by userId and contentToken', async () => {
    await upsertContentDailyRecords([
      makeRecord({ userId: USER_ID, contentToken: TOKEN_A, date: '2026-03-27' }),
      makeRecord({ userId: USER_ID, contentToken: TOKEN_B, date: '2026-03-27' }),
      makeRecord({ userId: OTHER_USER, contentToken: TOKEN_A, date: '2026-03-27' }),
    ]);
    const records = await getContentDailyRecords(USER_ID, TOKEN_A);
    expect(records).toHaveLength(1);
    expect(records[0].userId).toBe(USER_ID);
    expect(records[0].contentToken).toBe(TOKEN_A);
  });

  it('returns empty array when no records match', async () => {
    const records = await getContentDailyRecords(USER_ID, TOKEN_A);
    expect(records).toHaveLength(0);
  });
});

describe('getContentDailyLatestDate', () => {
  it('returns the latest date for a user+contentToken', async () => {
    await upsertContentDailyRecords([
      makeRecord({ date: '2026-03-25' }),
      makeRecord({ date: '2026-03-27' }),
      makeRecord({ date: '2026-03-26' }),
    ]);
    const latest = await getContentDailyLatestDate(USER_ID, TOKEN_A);
    expect(latest).toBe('2026-03-27');
  });

  it('returns null when no records exist', async () => {
    const latest = await getContentDailyLatestDate(USER_ID, TOKEN_A);
    expect(latest).toBeNull();
  });

  it('does not mix records from different tokens', async () => {
    await upsertContentDailyRecords([
      makeRecord({ contentToken: TOKEN_A, date: '2026-03-20' }),
      makeRecord({ contentToken: TOKEN_B, date: '2026-03-28' }),
    ]);
    const latest = await getContentDailyLatestDate(USER_ID, TOKEN_A);
    expect(latest).toBe('2026-03-20');
  });
});
