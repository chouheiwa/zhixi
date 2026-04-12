import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { getSavedAccounts, saveAccount, removeAccount, updateLastUsed } from '@/db/account-store';
import type { SavedAccount } from '@/shared/types';

const makeAccount = (overrides: Partial<SavedAccount> = {}): SavedAccount => ({
  userId: 'user-1',
  name: 'TestUser',
  urlToken: 'test-token',
  avatarUrl: 'https://example.com/avatar.jpg',
  addedAt: 1_700_000_000_000,
  lastUsedAt: 1_700_000_000_000,
  ...overrides,
});

beforeEach(async () => {
  await db.savedAccounts.clear();
});

describe('account-store', () => {
  describe('saveAccount + getSavedAccounts', () => {
    it('round-trips a single account', async () => {
      const account = makeAccount();
      await saveAccount(account);

      const list = await getSavedAccounts();
      expect(list).toEqual([account]);
    });

    it('upserts when the same userId is saved twice', async () => {
      await saveAccount(makeAccount({ name: 'Old' }));
      await saveAccount(makeAccount({ name: 'New' }));

      const list = await getSavedAccounts();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('New');
    });

    it('orders results by lastUsedAt descending', async () => {
      await saveAccount(makeAccount({ userId: 'a', lastUsedAt: 100 }));
      await saveAccount(makeAccount({ userId: 'b', lastUsedAt: 300 }));
      await saveAccount(makeAccount({ userId: 'c', lastUsedAt: 200 }));

      const list = await getSavedAccounts();
      expect(list.map((a) => a.userId)).toEqual(['b', 'c', 'a']);
    });

    it('returns an empty array when nothing is stored', async () => {
      expect(await getSavedAccounts()).toEqual([]);
    });
  });

  describe('removeAccount', () => {
    it('removes a previously saved account', async () => {
      await saveAccount(makeAccount({ userId: 'keep' }));
      await saveAccount(makeAccount({ userId: 'drop' }));

      await removeAccount('drop');

      const list = await getSavedAccounts();
      expect(list.map((a) => a.userId)).toEqual(['keep']);
    });

    it('is a no-op when the userId does not exist', async () => {
      await saveAccount(makeAccount({ userId: 'keep' }));
      await removeAccount('does-not-exist');

      const list = await getSavedAccounts();
      expect(list.map((a) => a.userId)).toEqual(['keep']);
    });
  });

  describe('updateLastUsed', () => {
    it('bumps lastUsedAt for the specified account', async () => {
      const originalTime = 1_700_000_000_000;
      await saveAccount(makeAccount({ lastUsedAt: originalTime }));

      await updateLastUsed('user-1');

      const [updated] = await getSavedAccounts();
      expect(updated.lastUsedAt).toBeGreaterThan(originalTime);
    });

    it('does not touch sibling accounts', async () => {
      await saveAccount(makeAccount({ userId: 'a', lastUsedAt: 100 }));
      await saveAccount(makeAccount({ userId: 'b', lastUsedAt: 200 }));

      await updateLastUsed('a');

      const list = await getSavedAccounts();
      const b = list.find((acc) => acc.userId === 'b');
      expect(b?.lastUsedAt).toBe(200);
    });
  });
});
