import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { db } from '@/db/database';
import { saveAccount } from '@/db/account-store';
import { useAccountManager } from '@/hooks/use-account-manager';
import type { SavedAccount, ZhihuUser } from '@/shared/types';

const ACTIVE_KEY = 'zhixi-active-account';

const makeAccount = (overrides: Partial<SavedAccount> = {}): SavedAccount => ({
  userId: 'user-1',
  name: 'TestUser',
  urlToken: 'test-token',
  avatarUrl: 'https://example.com/avatar.jpg',
  addedAt: 1_700_000_000_000,
  lastUsedAt: 1_700_000_000_000,
  ...overrides,
});

const makeUser = (overrides: Partial<ZhihuUser> = {}): ZhihuUser => ({
  id: 'user-2',
  urlToken: 'new-token',
  name: 'NewUser',
  avatarUrl: '',
  ...overrides,
});

beforeEach(async () => {
  await db.savedAccounts.clear();
  localStorage.clear();
});

describe('useAccountManager', () => {
  describe('loadAccounts', () => {
    it('loads the persisted list on mount', async () => {
      await saveAccount(makeAccount({ userId: 'a', lastUsedAt: 100 }));
      await saveAccount(makeAccount({ userId: 'b', lastUsedAt: 300 }));

      const { result } = renderHook(() => useAccountManager());

      await waitFor(() => expect(result.current.accounts).toHaveLength(2));
      // Ordered by lastUsedAt descending (see account-store)
      expect(result.current.accounts.map((a) => a.userId)).toEqual(['b', 'a']);
    });

    it('starts empty when there are no persisted accounts', async () => {
      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toEqual([]));
    });

    it('hydrates activeAccountId from localStorage synchronously', async () => {
      localStorage.setItem(ACTIVE_KEY, 'pre-existing-id');
      const { result } = renderHook(() => useAccountManager());
      expect(result.current.activeAccountId).toBe('pre-existing-id');
    });
  });

  describe('switchAccount', () => {
    it('sets the active account id and writes to localStorage', async () => {
      await saveAccount(makeAccount({ userId: 'u1' }));
      await saveAccount(makeAccount({ userId: 'u2' }));

      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toHaveLength(2));

      await act(async () => {
        await result.current.switchAccount('u2');
      });

      expect(result.current.activeAccountId).toBe('u2');
      expect(localStorage.getItem(ACTIVE_KEY)).toBe('u2');
    });
  });

  describe('addCurrentAccount', () => {
    it('inserts a new account and becomes the active one when none is active', async () => {
      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toEqual([]));

      await act(async () => {
        await result.current.addCurrentAccount(makeUser({ id: 'new-id' }));
      });

      await waitFor(() => expect(result.current.accounts).toHaveLength(1));
      expect(result.current.accounts[0].userId).toBe('new-id');
      expect(result.current.activeAccountId).toBe('new-id');
      expect(localStorage.getItem(ACTIVE_KEY)).toBe('new-id');
    });

    it('does not overwrite an existing active account when adding another', async () => {
      localStorage.setItem(ACTIVE_KEY, 'pinned');
      await saveAccount(makeAccount({ userId: 'pinned' }));

      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.addCurrentAccount(makeUser({ id: 'extra' }));
      });

      await waitFor(() => expect(result.current.accounts).toHaveLength(2));
      expect(result.current.activeAccountId).toBe('pinned');
    });
  });

  describe('removeAccount', () => {
    it('drops the account from the list', async () => {
      await saveAccount(makeAccount({ userId: 'a' }));
      await saveAccount(makeAccount({ userId: 'b' }));

      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toHaveLength(2));

      await act(async () => {
        await result.current.removeAccount('a');
      });

      await waitFor(() => expect(result.current.accounts).toHaveLength(1));
      expect(result.current.accounts[0].userId).toBe('b');
    });

    it('promotes another account when removing the active one', async () => {
      localStorage.setItem(ACTIVE_KEY, 'a');
      await saveAccount(makeAccount({ userId: 'a', lastUsedAt: 200 }));
      await saveAccount(makeAccount({ userId: 'b', lastUsedAt: 100 }));

      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toHaveLength(2));

      await act(async () => {
        await result.current.removeAccount('a');
      });

      await waitFor(() => expect(result.current.activeAccountId).toBe('b'));
      expect(localStorage.getItem(ACTIVE_KEY)).toBe('b');
    });

    it('clears the active id when removing the last account', async () => {
      localStorage.setItem(ACTIVE_KEY, 'solo');
      await saveAccount(makeAccount({ userId: 'solo' }));

      const { result } = renderHook(() => useAccountManager());
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.removeAccount('solo');
      });

      await waitFor(() => expect(result.current.activeAccountId).toBeNull());
      expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    });
  });

  describe('DB failure resilience', () => {
    it('degrades to an empty list when getSavedAccounts throws on mount', async () => {
      const spy = vi.spyOn(db.savedAccounts, 'orderBy').mockImplementationOnce(() => {
        throw new Error('indexeddb unavailable');
      });

      const { result } = renderHook(() => useAccountManager());

      await waitFor(() => expect(result.current.accounts).toEqual([]));
      spy.mockRestore();
    });
  });
});
