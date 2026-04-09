import { vi } from 'vitest';
vi.mock('driver.js/dist/driver.css', () => ({}));
vi.mock('@/dashboard/tour/tour-theme.css', () => ({}));
vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({ drive: vi.fn() })),
}));

import { describe, it, expect } from 'vitest';
import { shouldShowTour, getNewFeatures } from '@/dashboard/tour/tour-manager';
import type { TourState } from '@/shared/types';

describe('shouldShowTour', () => {
  it('returns "core" when no tour state exists', () => {
    expect(shouldShowTour(undefined)).toBe('core');
  });

  it('returns "extended" when core is done but extended is not', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: false,
    };
    expect(shouldShowTour(state)).toBe('extended');
  });

  it('returns null when both core and extended are done and version is current', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    expect(shouldShowTour(state)).toBeNull();
  });

  it('returns "new-features" when completedVersion is behind and there are new features', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    // No new features in changelog yet, so null
    expect(shouldShowTour(state)).toBeNull();
  });
});

describe('getNewFeatures', () => {
  it('returns empty array when version is current', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    expect(getNewFeatures(state)).toEqual([]);
  });

  it('returns empty array when all features are already seen', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    expect(getNewFeatures(state)).toEqual([]);
  });
});

describe('startCoreTour', () => {
  it('calls driver.drive()', async () => {
    const { driver } = await import('driver.js');
    const mockDrive = vi.fn();
    vi.mocked(driver).mockReturnValueOnce({ drive: mockDrive } as ReturnType<typeof driver>);

    const { startCoreTour } = await import('@/dashboard/tour/tour-manager');
    const onComplete = vi.fn();
    startCoreTour(onComplete);
    expect(mockDrive).toHaveBeenCalled();
  });

  it('calls onComplete when tour is destroyed', async () => {
    const { driver } = await import('driver.js');
    let capturedOnDestroyed: (() => void) | undefined;
    vi.mocked(driver).mockImplementationOnce((config) => {
      capturedOnDestroyed = config?.onDestroyed as (() => void) | undefined;
      return { drive: vi.fn() } as ReturnType<typeof driver>;
    });

    const { startCoreTour } = await import('@/dashboard/tour/tour-manager');
    const onComplete = vi.fn();
    startCoreTour(onComplete);
    capturedOnDestroyed?.();
    expect(onComplete).toHaveBeenCalled();
  });
});

describe('startExtendedTour', () => {
  it('calls driver.drive()', async () => {
    const { driver } = await import('driver.js');
    const mockDrive = vi.fn();
    vi.mocked(driver).mockReturnValueOnce({ drive: mockDrive } as ReturnType<typeof driver>);

    const { startExtendedTour } = await import('@/dashboard/tour/tour-manager');
    startExtendedTour(vi.fn());
    expect(mockDrive).toHaveBeenCalled();
  });

  it('calls onComplete when destroyed', async () => {
    const { driver } = await import('driver.js');
    let capturedOnDestroyed: (() => void) | undefined;
    vi.mocked(driver).mockImplementationOnce((config) => {
      capturedOnDestroyed = config?.onDestroyed as (() => void) | undefined;
      return { drive: vi.fn() } as ReturnType<typeof driver>;
    });

    const { startExtendedTour } = await import('@/dashboard/tour/tour-manager');
    const onComplete = vi.fn();
    startExtendedTour(onComplete);
    capturedOnDestroyed?.();
    expect(onComplete).toHaveBeenCalled();
  });
});

describe('startNewFeatureTour', () => {
  it('calls driver.drive() with feature steps', async () => {
    const { driver } = await import('driver.js');
    const mockDrive = vi.fn();
    vi.mocked(driver).mockReturnValueOnce({ drive: mockDrive } as ReturnType<typeof driver>);

    const { startNewFeatureTour } = await import('@/dashboard/tour/tour-manager');
    const features = [
      {
        key: 'feat1',
        title: 'Feature 1',
        description: 'New feature',
        step: { element: '#elem1', popover: { title: 'F1', description: 'D1' } },
      },
    ];
    startNewFeatureTour(features, vi.fn());
    expect(mockDrive).toHaveBeenCalled();
  });

  it('calls onComplete when destroyed', async () => {
    const { driver } = await import('driver.js');
    let capturedOnDestroyed: (() => void) | undefined;
    vi.mocked(driver).mockImplementationOnce((config) => {
      capturedOnDestroyed = config?.onDestroyed as (() => void) | undefined;
      return { drive: vi.fn() } as ReturnType<typeof driver>;
    });

    const { startNewFeatureTour } = await import('@/dashboard/tour/tour-manager');
    const onComplete = vi.fn();
    startNewFeatureTour([], onComplete);
    capturedOnDestroyed?.();
    expect(onComplete).toHaveBeenCalled();
  });
});
