/**
 * Store module for the `creations` table — the local cache of a user's full
 * creation list (articles, answers, pins) sourced from
 * `/api/v4/creators/creations/v2/all`.
 *
 * Design: docs/superpowers/specs/2026-04-12-creations-cache-design.md
 */
import { db, type CreationRecord } from './database';
import type { CreationItem } from '@/api/zhihu-creations';

export type { CreationRecord } from './database';

const LAST_SYNCED_STORAGE_KEY = 'creations-last-synced';

type LastSyncedMap = Record<string, number>;

function normalizeContentType(raw: string): CreationRecord['contentType'] {
  if (raw === 'article' || raw === 'answer' || raw === 'pin') return raw;
  return 'answer';
}

/** Read all cached creations for a user (unordered). */
export async function getCreations(userId: string): Promise<CreationRecord[]> {
  return db.creations.where('userId').equals(userId).toArray();
}

/** Read the set of cached contentIds for a user. Used for incremental short-circuit and reconciliation. */
export async function getCreationContentIds(userId: string): Promise<Set<string>> {
  const rows = await db.creations.where('userId').equals(userId).toArray();
  return new Set(rows.map((r) => r.contentId));
}

/**
 * Merge a batch of freshly-fetched creations into the cache.
 *
 * - Preserves `firstSeenAt` for rows that already exist locally.
 * - Refreshes `lastFetchedAt` and all counter fields for every row in `items`.
 * - Never deletes anything — caller must explicitly call `reconcileCreations`
 *   if deletion detection is desired.
 */
export async function upsertCreations(userId: string, items: CreationItem[]): Promise<{ addedCount: number }> {
  if (items.length === 0) return { addedCount: 0 };

  const existing = await db.creations.where('userId').equals(userId).toArray();
  const existingMap = new Map<string, CreationRecord>();
  for (const row of existing) existingMap.set(row.contentId, row);

  const now = Date.now();
  let addedCount = 0;
  const records: CreationRecord[] = items.map((item) => {
    const prev = existingMap.get(item.contentId);
    if (!prev) addedCount += 1;
    return {
      userId,
      contentId: item.contentId,
      contentToken: item.contentToken,
      contentType: normalizeContentType(item.contentType),
      title: item.title,
      publishDate: item.publishDate,
      readCount: item.readCount,
      upvoteCount: item.upvoteCount,
      commentCount: item.commentCount,
      collectCount: item.collectCount,
      firstSeenAt: prev ? prev.firstSeenAt : now,
      lastFetchedAt: now,
    };
  });

  await db.creations.bulkPut(records);
  return { addedCount };
}

/**
 * Delete every cached row whose contentId is NOT in `aliveContentIds`. Used by
 * the "深度同步" path after a full rescan to clean up content the user deleted
 * on Zhihu.
 */
export async function reconcileCreations(
  userId: string,
  aliveContentIds: Set<string>,
): Promise<{ deletedCount: number }> {
  const existingIds = await getCreationContentIds(userId);
  const toDelete: [string, string][] = [];
  for (const id of existingIds) {
    if (!aliveContentIds.has(id)) toDelete.push([userId, id]);
  }
  if (toDelete.length === 0) return { deletedCount: 0 };
  await db.creations.bulkDelete(toDelete);
  return { deletedCount: toDelete.length };
}

/** Read the timestamp (ms) of the last successful refresh for this user. */
export async function getCreationsLastSyncedAt(userId: string): Promise<number | null> {
  const map = await readLastSyncedMap();
  const value = map[userId];
  return typeof value === 'number' ? value : null;
}

/** Write the timestamp (ms) of the last successful refresh for this user. */
export async function setCreationsLastSyncedAt(userId: string, ts: number): Promise<void> {
  const map = await readLastSyncedMap();
  map[userId] = ts;
  await writeLastSyncedMap(map);
}

async function readLastSyncedMap(): Promise<LastSyncedMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get(LAST_SYNCED_STORAGE_KEY, (result: Record<string, unknown>) => {
      const raw = result?.[LAST_SYNCED_STORAGE_KEY];
      if (raw && typeof raw === 'object') {
        resolve(raw as LastSyncedMap);
      } else {
        resolve({});
      }
    });
  });
}

async function writeLastSyncedMap(map: LastSyncedMap): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_SYNCED_STORAGE_KEY]: map }, () => resolve());
  });
}
