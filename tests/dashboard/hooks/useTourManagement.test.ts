import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeDailySummaries, makeIncomeRecords } from '../../helpers/mock-data';

// Mock tour-store
vi.mock('@/db/tour-store', () => ({
  getTourState: vi.fn(() => Promise.resolve(null)),
  saveTourState: vi.fn(() => Promise.resolve()),
  markCoreCompleted: vi.fn(() => Promise.resolve()),
  markExtendedCompleted: vi.fn(() => Promise.resolve()),
  markFeaturesRead: vi.fn(() => Promise.resolve()),
  updateCompletedVersion: vi.fn(() => Promise.resolve()),
  resetTourState: vi.fn(() => Promise.resolve()),
}));

// Mock tour-manager
vi.mock('@/dashboard/tour/tour-manager', () => ({
  getNewFeatures: vi.fn(() => []),
  startCoreTour: vi.fn((cb: () => void) => cb()),
  startExtendedTour: vi.fn((cb: () => void) => cb()),
  startNewFeatureTour: vi.fn((_features: unknown[], cb: () => void) => cb()),
}));

// Mock tour-config
vi.mock('@/dashboard/tour/tour-config', () => ({
  TOUR_VERSION: '1.0.0',
}));

// Mock demo-data
vi.mock('@/dashboard/tour/demo-data', () => ({
  getDemoSummaries: vi.fn(() => makeDailySummaries(7)),
  getDemoRecords: vi.fn(() => makeIncomeRecords(5)),
}));

import { useTourManagement } from '@/dashboard/hooks/useTourManagement';

const tourCallbacks = { switchTab: vi.fn(), onAction: vi.fn() };

describe('useTourManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('returns initial state with no userId', () => {
    const { result } = renderHook(() =>
      useTourManagement({
        userId: undefined,
        allSummaries: [],
        allIncomeRecords: [],
        tourCallbacks,
      }),
    );

    expect(result.current.tourActive).toBe(false);
    expect(result.current.useDemo).toBe(false);
    expect(result.current.showNewFeatureBanner).toBe(false);
  });

  it('loads tour state when userId is provided', async () => {
    const { getTourState } = await import('@/db/tour-store');
    (getTourState as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    });

    const { result } = renderHook(() =>
      useTourManagement({
        userId: 'user-1',
        allSummaries: makeDailySummaries(7),
        allIncomeRecords: makeIncomeRecords(5),
        tourCallbacks,
      }),
    );

    // Wait for async effect
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getTourState).toHaveBeenCalledWith('user-1');
  });

  it('shows new features banner when applicable', async () => {
    const { getTourState } = await import('@/db/tour-store');
    const { getNewFeatures } = await import('@/dashboard/tour/tour-manager');
    (getTourState as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    });
    (getNewFeatures as ReturnType<typeof vi.fn>).mockReturnValue([
      { key: 'feature1', element: '#el', description: 'New feature' },
    ]);

    const { result } = renderHook(() =>
      useTourManagement({
        userId: 'user-1',
        allSummaries: makeDailySummaries(7),
        allIncomeRecords: makeIncomeRecords(5),
        tourCallbacks,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.showNewFeatureBanner).toBe(true);
    expect(result.current.newFeatureCount).toBe(1);
  });

  it('handleDismissNewFeatures clears banner', async () => {
    const { getTourState } = await import('@/db/tour-store');
    const { getNewFeatures } = await import('@/dashboard/tour/tour-manager');
    (getTourState as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    });
    (getNewFeatures as ReturnType<typeof vi.fn>).mockReturnValue([{ key: 'f1', element: '#el', description: 'F1' }]);

    const { result } = renderHook(() =>
      useTourManagement({
        userId: 'user-1',
        allSummaries: makeDailySummaries(7),
        allIncomeRecords: makeIncomeRecords(5),
        tourCallbacks,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.showNewFeatureBanner).toBe(true);

    act(() => {
      result.current.handleDismissNewFeatures();
    });

    expect(result.current.showNewFeatureBanner).toBe(false);
  });

  it('effectiveDateRange computes from summaries', () => {
    const summaries = makeDailySummaries(7, '2024-01-01');
    const { result } = renderHook(() =>
      useTourManagement({
        userId: 'user-1',
        allSummaries: summaries,
        allIncomeRecords: [],
        tourCallbacks,
      }),
    );

    expect(result.current.effectiveDateRange.start).toBe(summaries[0].date);
    expect(result.current.effectiveDateRange.end).toBe(summaries[summaries.length - 1].date);
  });

  it('effectiveDateRange returns empty for no summaries', () => {
    const { result } = renderHook(() =>
      useTourManagement({
        userId: 'user-1',
        allSummaries: [],
        allIncomeRecords: [],
        tourCallbacks,
      }),
    );

    expect(result.current.effectiveDateRange.start).toBe('');
    expect(result.current.effectiveDateRange.end).toBe('');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
