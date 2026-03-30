import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  getTourState,
  saveTourState,
  markCoreCompleted,
  markExtendedCompleted,
  markFeaturesRead,
  updateCompletedVersion,
  resetTourState,
} from '@/db/tour-store';

beforeEach(async () => {
  await db.tourState.clear();
});

describe('tour-store', () => {
  const userId = 'test-user-1';

  it('returns undefined when no tour state exists', async () => {
    const state = await getTourState(userId);
    expect(state).toBeUndefined();
  });

  it('saves and retrieves tour state', async () => {
    const state = {
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['feat1'],
      coreCompleted: true,
      extendedCompleted: false,
    };
    await saveTourState(state);
    const retrieved = await getTourState(userId);
    expect(retrieved).toEqual(state);
  });

  it('marks core completed', async () => {
    await saveTourState({
      userId,
      completedVersion: '',
      seenFeatures: [],
      coreCompleted: false,
      extendedCompleted: false,
    });
    await markCoreCompleted(userId);
    const state = await getTourState(userId);
    expect(state?.coreCompleted).toBe(true);
  });

  it('marks extended completed', async () => {
    await saveTourState({
      userId,
      completedVersion: '',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: false,
    });
    await markExtendedCompleted(userId);
    const state = await getTourState(userId);
    expect(state?.extendedCompleted).toBe(true);
  });

  it('marks features as read', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['old'],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await markFeaturesRead(userId, ['new1', 'new2']);
    const state = await getTourState(userId);
    expect(state?.seenFeatures).toEqual(['old', 'new1', 'new2']);
  });

  it('updates completed version', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await updateCompletedVersion(userId, '1.1.0');
    const state = await getTourState(userId);
    expect(state?.completedVersion).toBe('1.1.0');
  });

  it('resets tour state', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['feat1'],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await resetTourState(userId);
    const state = await getTourState(userId);
    expect(state?.coreCompleted).toBe(false);
    expect(state?.extendedCompleted).toBe(false);
  });
});
