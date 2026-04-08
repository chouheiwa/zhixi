import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { UserSettings } from '@/shared/types';

const mockSettings: UserSettings = {
  userId: 'u1',
  collectStartDate: '2025-01-01',
  autoSyncEnabled: true,
  autoSyncIntervalHours: 6,
};

vi.mock('@/db/income-store', () => ({
  getUserSettings: vi.fn(),
}));

import { getUserSettings } from '@/db/income-store';
import { useUserSettings } from '@/hooks/use-user-settings';

const mockGetUserSettings = vi.mocked(getUserSettings);

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null settings when userId is empty', async () => {
    const { result } = renderHook(() => useUserSettings(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();
    expect(mockGetUserSettings).not.toHaveBeenCalled();
  });

  it('loads settings for given userId', async () => {
    mockGetUserSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(mockSettings);
    expect(mockGetUserSettings).toHaveBeenCalledWith('u1');
  });

  it('returns null when no settings found (getUserSettings returns undefined)', async () => {
    mockGetUserSettings.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();
  });

  it('refresh reloads settings', async () => {
    mockGetUserSettings.mockResolvedValueOnce(undefined).mockResolvedValueOnce(mockSettings);

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.settings).toEqual(mockSettings));
  });
});
