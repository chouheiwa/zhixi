import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SavedAccount, ZhihuUser } from '@/shared/types';

const mockUser: ZhihuUser = {
  id: 'u1',
  urlToken: 'test-user',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
};

vi.mock('@/api/zhihu-income', () => ({
  fetchCurrentUser: vi.fn(),
}));

vi.mock('@/db/account-store', () => ({
  getSavedAccounts: vi.fn(() => Promise.resolve([])),
  saveAccount: vi.fn(() => Promise.resolve()),
}));

import { fetchCurrentUser } from '@/api/zhihu-income';
import { getSavedAccounts, saveAccount } from '@/db/account-store';
import { useCurrentUser } from '@/hooks/use-current-user';

const mockFetchCurrentUser = vi.mocked(fetchCurrentUser);
const mockGetSavedAccounts = vi.mocked(getSavedAccounts);
const mockSaveAccount = vi.mocked(saveAccount);

describe('useCurrentUser', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetAllMocks();
  });

  it('returns null user and loading=true initially when no cache', async () => {
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    const { result } = renderHook(() => useCurrentUser());

    // Before fetch resolves: user is null, loading is true
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('fetches and sets user after mount', async () => {
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
  });

  it('uses cached user from sessionStorage and loading is false immediately', async () => {
    sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(mockUser));
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    const { result } = renderHook(() => useCurrentUser());

    // With cache: user is available immediately and loading starts as false
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.loading).toBe(false);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('keeps cached user on fetch failure', async () => {
    sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(mockUser));
    mockFetchCurrentUser.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
  });

  it('auto-saves the fetched user into the savedAccounts table', async () => {
    mockFetchCurrentUser.mockResolvedValue(mockUser);
    mockGetSavedAccounts.mockResolvedValue([]);
    mockSaveAccount.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Flush the auto-save side chain queued after the fetch resolves.
    await waitFor(() => expect(mockSaveAccount).toHaveBeenCalled());
    const saved = mockSaveAccount.mock.calls[0][0];
    expect(saved.userId).toBe('u1');
    expect(saved.name).toBe('Test User');
  });

  it('reuses the existing addedAt when the account already exists', async () => {
    mockFetchCurrentUser.mockResolvedValue(mockUser);
    const existingAccount: SavedAccount = {
      userId: 'u1',
      name: 'Old Name',
      urlToken: 'test-user',
      avatarUrl: 'old.png',
      addedAt: 111,
      lastUsedAt: 222,
    };
    mockGetSavedAccounts.mockResolvedValue([existingAccount]);
    mockSaveAccount.mockResolvedValue(undefined);

    renderHook(() => useCurrentUser());

    await waitFor(() => expect(mockSaveAccount).toHaveBeenCalled());
    const saved = mockSaveAccount.mock.calls[0][0];
    expect(saved.addedAt).toBe(111);
    expect(saved.lastUsedAt).not.toBe(222);
  });

  it('swallows savedAccounts side-chain failures silently', async () => {
    mockFetchCurrentUser.mockResolvedValue(mockUser);
    mockGetSavedAccounts.mockRejectedValue(new Error('db down'));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    // The hook should still have picked up the fetched user even though
    // the side chain failed.
    expect(result.current.user).toEqual(mockUser);
  });

  describe('overrideUserId branch', () => {
    it('loads the override account from savedAccounts', async () => {
      const override: SavedAccount = {
        userId: 'other',
        name: 'Other User',
        urlToken: 'other-token',
        avatarUrl: 'https://example.com/other.png',
        addedAt: 100,
        lastUsedAt: 200,
      };
      mockGetSavedAccounts.mockResolvedValue([override]);

      const { result } = renderHook(() => useCurrentUser('other'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toEqual({
        id: 'other',
        name: 'Other User',
        urlToken: 'other-token',
        avatarUrl: 'https://example.com/other.png',
      });
      expect(mockFetchCurrentUser).not.toHaveBeenCalled();
    });

    it('keeps previous user when the override id is not in savedAccounts', async () => {
      sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(mockUser));
      mockGetSavedAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useCurrentUser('unknown'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      // Falls back to the cached user since the lookup didn't match.
      expect(result.current.user).toEqual(mockUser);
    });

    it('handles savedAccounts lookup failure for overrideUserId gracefully', async () => {
      sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(mockUser));
      mockGetSavedAccounts.mockRejectedValue(new Error('db down'));

      const { result } = renderHook(() => useCurrentUser('other'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toEqual(mockUser);
    });
  });
});
