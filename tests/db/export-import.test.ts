import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { upsertIncomeRecords } from '@/db/income-store';
import { exportToJSON, importFromJSON } from '@/db/export-import';
import type {
  IncomeRecord,
  ContentDailyRecord,
  RealtimeAggrRecord,
  PanelLayout,
  TourState,
  SavedAccount,
} from '@/shared/types';

const makeRecord = (id: string, date: string): IncomeRecord => ({
  userId: 'testuser',
  contentId: id,
  contentToken: `token${id}`,
  title: `Title ${id}`,
  contentType: 'answer',
  publishDate: '2026-03-20',
  recordDate: date,
  currentRead: 100,
  currentInteraction: 10,
  currentIncome: 50,
  totalRead: 200,
  totalInteraction: 20,
  totalIncome: 100,
  collectedAt: Date.now(),
});

const makeContentDaily = (token: string, date: string): ContentDailyRecord => ({
  userId: 'testuser',
  contentToken: token,
  contentId: `c-${token}`,
  contentType: 'article',
  title: `Title ${token}`,
  date,
  pv: 50,
  show: 100,
  upvote: 10,
  comment: 2,
  like: 3,
  collect: 1,
  share: 0,
  play: 0,
  collectedAt: Date.now(),
});

const makeRealtime = (date: string): RealtimeAggrRecord => ({
  userId: 'testuser',
  date,
  updatedAt: date,
  pv: 200,
  play: 0,
  show: 300,
  upvote: 20,
  comment: 3,
  like: 5,
  collect: 2,
  share: 0,
  reaction: 1,
  rePin: 0,
  likeAndReaction: 6,
  newUpvote: 4,
  newLike: 2,
  newIncrUpvoteNum: 5,
  newDescUpvoteNum: -1,
  newIncrLikeNum: 3,
  newDescLikeNum: 0,
  collectedAt: Date.now(),
});

const makePanelLayout = (): PanelLayout => ({
  userId: 'testuser',
  tabs: [{ key: 'overview', label: '总览', visible: true, order: 0, panels: [] }],
});

const makeTourState = (): TourState => ({
  userId: 'testuser',
  completedVersion: '1.0.0',
  seenFeatures: ['income'],
  coreCompleted: true,
  extendedCompleted: false,
});

const makeSavedAccount = (): SavedAccount => ({
  userId: 'testuser',
  name: '测试',
  urlToken: 'test',
  avatarUrl: 'https://example.com/a.png',
  addedAt: Date.now(),
  lastUsedAt: Date.now(),
});

beforeEach(async () => {
  await Promise.all([
    db.incomeRecords.clear(),
    db.contentDaily.clear(),
    db.realtimeAggr.clear(),
    db.syncedDates.clear(),
    db.panelLayout.clear(),
    db.tourState.clear(),
    db.savedAccounts.clear(),
    db.incomeGoals.clear(),
    db.creations.clear(),
    db.contentDailyCache.clear(),
    db.userSettings.clear(),
    db.mlModels.clear(),
  ]);
});

describe('exportToJSON', () => {
  it('exports every table in v2 format with metadata', async () => {
    await upsertIncomeRecords([makeRecord('1', '2026-03-27')]);
    await db.contentDaily.put(makeContentDaily('tok1', '2026-03-27'));
    await db.realtimeAggr.put(makeRealtime('2026-03-27'));
    await db.panelLayout.put(makePanelLayout());
    await db.tourState.put(makeTourState());
    await db.savedAccounts.put(makeSavedAccount());

    const json = await exportToJSON();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(2);
    expect(parsed.exportedAt).toBeTypeOf('number');
    expect(parsed.tables.incomeRecords).toHaveLength(1);
    expect(parsed.tables.contentDaily).toHaveLength(1);
    expect(parsed.tables.realtimeAggr).toHaveLength(1);
    expect(parsed.tables.panelLayout).toHaveLength(1);
    expect(parsed.tables.tourState).toHaveLength(1);
    expect(parsed.tables.savedAccounts).toHaveLength(1);
    // Empty tables still present as arrays
    expect(Array.isArray(parsed.tables.syncedDates)).toBe(true);
    expect(Array.isArray(parsed.tables.creations)).toBe(true);
  });
});

describe('importFromJSON', () => {
  it('imports a v2 payload into every declared table', async () => {
    const payload = {
      version: 2,
      exportedAt: Date.now(),
      tables: {
        incomeRecords: [makeRecord('2', '2026-03-27')],
        contentDaily: [makeContentDaily('tok2', '2026-03-27')],
        realtimeAggr: [makeRealtime('2026-03-27')],
        panelLayout: [makePanelLayout()],
        tourState: [makeTourState()],
        savedAccounts: [makeSavedAccount()],
      },
    };

    const result = await importFromJSON(JSON.stringify(payload));

    expect(result.imported).toBe(6);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.tables.incomeRecords).toBe(1);
    expect(result.tables.contentDaily).toBe(1);
    expect(result.tables.realtimeAggr).toBe(1);
    expect(result.tables.panelLayout).toBe(1);
    expect(result.tables.tourState).toBe(1);
    expect(result.tables.savedAccounts).toBe(1);

    expect(await db.incomeRecords.count()).toBe(1);
    expect(await db.contentDaily.count()).toBe(1);
    expect(await db.realtimeAggr.count()).toBe(1);
    expect(await db.panelLayout.count()).toBe(1);
    expect(await db.tourState.count()).toBe(1);
    expect(await db.savedAccounts.count()).toBe(1);
  });

  it('accepts legacy v1 payloads by routing records → incomeRecords', async () => {
    await upsertIncomeRecords([makeRecord('1', '2026-03-26')]);
    const importData = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      records: [makeRecord('2', '2026-03-27')],
    });
    const result = await importFromJSON(importData);
    expect(result.imported).toBe(1);
    expect(result.tables.incomeRecords).toBe(1);
    expect(await db.incomeRecords.count()).toBe(2);
  });

  it('skips invalid records across tables and reports per-table errors', async () => {
    const invalidIncome = { ...makeRecord('3', '2026-03-28'), currentIncome: -1 };
    const invalidContentDaily = { ...makeContentDaily('tok3', '2026-03-28'), date: 'bad-date' };
    const payload = {
      version: 2,
      exportedAt: Date.now(),
      tables: {
        incomeRecords: [makeRecord('2', '2026-03-27'), invalidIncome],
        contentDaily: [invalidContentDaily, makeContentDaily('tok4', '2026-03-27')],
      },
    };

    const result = await importFromJSON(JSON.stringify(payload));

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.includes('incomeRecords'))).toBe(true);
    expect(result.errors.some((e) => e.includes('contentDaily'))).toBe(true);
    expect(result.tables.incomeRecords).toBe(1);
    expect(result.tables.contentDaily).toBe(1);
  });

  it('allows negative delta fields in realtimeAggr', async () => {
    const realtime = makeRealtime('2026-03-27');
    realtime.newDescUpvoteNum = -5;
    const payload = {
      version: 2,
      exportedAt: Date.now(),
      tables: { realtimeAggr: [realtime] },
    };
    const result = await importFromJSON(JSON.stringify(payload));
    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('ignores unknown top-level table keys without throwing', async () => {
    const payload = {
      version: 2,
      exportedAt: Date.now(),
      tables: {
        incomeRecords: [makeRecord('2', '2026-03-27')],
        bogusTable: [{ foo: 'bar' }],
      },
    };
    const result = await importFromJSON(JSON.stringify(payload));
    expect(result.imported).toBe(1);
    expect(result.tables.incomeRecords).toBe(1);
  });

  it('throws on invalid JSON', async () => {
    await expect(importFromJSON('not json')).rejects.toThrow('JSON 解析失败');
  });

  it('throws on wrong version', async () => {
    await expect(importFromJSON(JSON.stringify({ version: 999, records: [] }))).rejects.toThrow('不支持的数据版本');
  });

  it('throws on v2 payload missing tables object', async () => {
    await expect(importFromJSON(JSON.stringify({ version: 2, exportedAt: 0 }))).rejects.toThrow('缺少 tables 对象');
  });
});
