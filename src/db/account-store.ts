import { db } from './database';
import type { SavedAccount } from '@/shared/types';

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  return db.savedAccounts.orderBy('lastUsedAt').reverse().toArray();
}

export async function saveAccount(account: SavedAccount): Promise<void> {
  await db.savedAccounts.put(account);
}

export async function removeAccount(userId: string): Promise<void> {
  await db.savedAccounts.delete(userId);
}

export async function updateLastUsed(userId: string): Promise<void> {
  await db.savedAccounts.update(userId, { lastUsedAt: Date.now() });
}
