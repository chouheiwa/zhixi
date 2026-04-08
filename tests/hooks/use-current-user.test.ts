import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ZhihuUser } from '@/shared/types';

const mockUser: ZhihuUser = {
  id: 'u1',
  urlToken: 'test-user',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
};

vi.mock('@/api/zhihu-income', () => ({
  fetchCurrentUser: vi.fn(),
}));

import { fetchCurrentUser } from '@/api/zhihu-income';
import { useCurrentUser } from '@/hooks/use-current-user';

const mockFetchCurrentUser = vi.mocked(fetchCurrentUser);

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
});
