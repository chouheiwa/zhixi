import { useState, useEffect, useCallback } from 'react';
import { getSavedAccounts, saveAccount, removeAccount, updateLastUsed } from '@/db/account-store';
import type { SavedAccount, ZhihuUser } from '@/shared/types';

const ACTIVE_ACCOUNT_KEY = 'zhixi-active-account';

function getStoredActiveAccountId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function storeActiveAccountId(userId: string): void {
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  } catch {
    // ignore storage errors
  }
}

export function useAccountManager() {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => getStoredActiveAccountId());

  const loadAccounts = useCallback(async () => {
    const list = await getSavedAccounts();
    setAccounts(list);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const switchAccount = useCallback(async (userId: string) => {
    storeActiveAccountId(userId);
    setActiveAccountId(userId);
    await updateLastUsed(userId);
    // Reload accounts to reflect updated lastUsedAt
    const list = await getSavedAccounts();
    setAccounts(list);
  }, []);

  const addCurrentAccount = useCallback(
    async (user: ZhihuUser) => {
      const existing = accounts.find((a) => a.userId === user.id);
      const now = Date.now();
      const account: SavedAccount = {
        userId: user.id,
        name: user.name,
        urlToken: user.urlToken,
        avatarUrl: user.avatarUrl,
        addedAt: existing?.addedAt ?? now,
        lastUsedAt: now,
      };
      await saveAccount(account);

      // Set as active if no active account is set
      if (!activeAccountId) {
        storeActiveAccountId(user.id);
        setActiveAccountId(user.id);
      }

      const list = await getSavedAccounts();
      setAccounts(list);
    },
    [accounts, activeAccountId],
  );

  const handleRemoveAccount = useCallback(
    async (userId: string) => {
      await removeAccount(userId);
      // If removing the active account, switch to the most-recently-used other account
      if (userId === activeAccountId) {
        const list = await getSavedAccounts();
        const next = list.find((a) => a.userId !== userId);
        const nextId = next?.userId ?? null;
        if (nextId) {
          storeActiveAccountId(nextId);
          setActiveAccountId(nextId);
        } else {
          try {
            localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
          } catch {
            // ignore
          }
          setActiveAccountId(null);
        }
        setAccounts(list.filter((a) => a.userId !== userId));
      } else {
        const list = await getSavedAccounts();
        setAccounts(list);
      }
    },
    [activeAccountId],
  );

  return {
    accounts,
    activeAccountId,
    switchAccount,
    addCurrentAccount,
    removeAccount: handleRemoveAccount,
  };
}
