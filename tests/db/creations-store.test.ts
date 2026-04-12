import 'fake-indexeddb/auto';
import '../setup/chrome-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  getCreations,
  getCreationContentIds,
  upsertCreations,
  reconcileCreations,
  getCreationsLastSyncedAt,
  setCreationsLastSyncedAt,
} from '@/db/creations-store';
import type { CreationItem } from '@/api/zhihu-creations';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeItem(overrides: Partial<CreationItem> = {}): CreationItem {
  return {
    contentId: 'c-1',
    contentToken: 'token-1',
    contentType: 'article',
    title: 'Sample article',
    publishDate: '2026-01-01',
    readCount: 100,
    upvoteCount: 10,
    commentCount: 3,
    collectCount: 5,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.creations.clear();
});

describe('upsertCreations', () => {
  it('returns addedCount 0 and writes nothing for an empty batch', async () => {
    const { addedCount } = await upsertCreations(USER_A, []);
    expect(addedCount).toBe(0);
    expect(await db.creations.count()).toBe(0);
  });

  it('inserts new rows with firstSeenAt and lastFetchedAt set to now', async () => {
    const before = Date.now();
    const { addedCount } = await upsertCreations(USER_A, [
      makeItem({ contentId: 'c-1' }),
      makeItem({ contentId: 'c-2', title: 'second' }),
    ]);
    const after = Date.now();

    expect(addedCount).toBe(2);
    const rows = await getCreations(USER_A);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.firstSeenAt).toBeGreaterThanOrEqual(before);
      expect(row.firstSeenAt).toBeLessThanOrEqual(after);
      expect(row.lastFetchedAt).toBe(row.firstSeenAt);
      expect(row.userId).toBe(USER_A);
    }
  });

  it('preserves firstSeenAt but refreshes lastFetchedAt and counters on re-upsert', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1', readCount: 100 })]);
    const before = await db.creations.get([USER_A, 'c-1']);
    expect(before).toBeDefined();
    const originalFirstSeen = before!.firstSeenAt;

    // Wait a tick so Date.now() advances
    await new Promise((r) => setTimeout(r, 5));

    const { addedCount } = await upsertCreations(USER_A, [
      makeItem({ contentId: 'c-1', readCount: 250, upvoteCount: 99 }),
    ]);
    expect(addedCount).toBe(0);

    const after = await db.creations.get([USER_A, 'c-1']);
    expect(after).toBeDefined();
    expect(after!.firstSeenAt).toBe(originalFirstSeen);
    expect(after!.lastFetchedAt).toBeGreaterThanOrEqual(originalFirstSeen);
    expect(after!.readCount).toBe(250);
    expect(after!.upvoteCount).toBe(99);
  });

  it('correctly counts added rows for a mixed batch', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1' }), makeItem({ contentId: 'c-2' })]);
    const { addedCount } = await upsertCreations(USER_A, [
      makeItem({ contentId: 'c-1', readCount: 999 }),
      makeItem({ contentId: 'c-3' }),
      makeItem({ contentId: 'c-4' }),
    ]);
    expect(addedCount).toBe(2);
    expect(await db.creations.count()).toBe(4);
  });

  it('normalizes unknown contentType to "answer"', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1', contentType: 'bogus' as unknown as 'article' })]);
    const row = await db.creations.get([USER_A, 'c-1']);
    expect(row?.contentType).toBe('answer');
  });

  it('keeps per-user isolation', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1' })]);
    await upsertCreations(USER_B, [makeItem({ contentId: 'c-1', readCount: 7 })]);
    const rowsA = await getCreations(USER_A);
    const rowsB = await getCreations(USER_B);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].readCount).toBe(100);
    expect(rowsB[0].readCount).toBe(7);
  });
});

describe('getCreationContentIds', () => {
  it('returns empty set when no rows exist', async () => {
    const ids = await getCreationContentIds(USER_A);
    expect(ids.size).toBe(0);
  });

  it('returns the set of contentIds for a user only', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1' }), makeItem({ contentId: 'c-2' })]);
    await upsertCreations(USER_B, [makeItem({ contentId: 'c-99' })]);
    const ids = await getCreationContentIds(USER_A);
    expect(ids.size).toBe(2);
    expect(ids.has('c-1')).toBe(true);
    expect(ids.has('c-2')).toBe(true);
    expect(ids.has('c-99')).toBe(false);
  });
});

describe('reconcileCreations', () => {
  it('deletes rows whose contentIds are not in the alive set', async () => {
    await upsertCreations(USER_A, [
      makeItem({ contentId: 'c-1' }),
      makeItem({ contentId: 'c-2' }),
      makeItem({ contentId: 'c-3' }),
    ]);
    const { deletedCount } = await reconcileCreations(USER_A, new Set(['c-1', 'c-3']));
    expect(deletedCount).toBe(1);
    const remaining = (await getCreations(USER_A)).map((r) => r.contentId).sort();
    expect(remaining).toEqual(['c-1', 'c-3']);
  });

  it('returns 0 when every existing row is alive', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1' })]);
    const { deletedCount } = await reconcileCreations(USER_A, new Set(['c-1']));
    expect(deletedCount).toBe(0);
  });

  it('does not touch rows belonging to other users', async () => {
    await upsertCreations(USER_A, [makeItem({ contentId: 'c-1' })]);
    await upsertCreations(USER_B, [makeItem({ contentId: 'c-1' }), makeItem({ contentId: 'c-2' })]);
    const { deletedCount } = await reconcileCreations(USER_A, new Set());
    expect(deletedCount).toBe(1);
    expect((await getCreations(USER_B)).length).toBe(2);
  });
});

describe('lastSyncedAt persistence', () => {
  it('round-trips a timestamp per user via chrome.storage.local', async () => {
    expect(await getCreationsLastSyncedAt(USER_A)).toBeNull();
    await setCreationsLastSyncedAt(USER_A, 111);
    await setCreationsLastSyncedAt(USER_B, 222);
    expect(await getCreationsLastSyncedAt(USER_A)).toBe(111);
    expect(await getCreationsLastSyncedAt(USER_B)).toBe(222);
  });

  it('overwrites the previous timestamp', async () => {
    await setCreationsLastSyncedAt(USER_A, 500);
    await setCreationsLastSyncedAt(USER_A, 1500);
    expect(await getCreationsLastSyncedAt(USER_A)).toBe(1500);
  });
});
