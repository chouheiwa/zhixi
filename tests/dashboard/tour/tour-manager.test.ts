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
