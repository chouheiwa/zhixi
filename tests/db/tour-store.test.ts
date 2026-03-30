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

const USER_ID = 'test-user-1';

const makeState = (overrides = {}) => ({
  userId: USER_ID,
  completedVersion: '1.0.0',
  seenFeatures: [] as string[],
  coreCompleted: false,
  extendedCompleted: false,
  ...overrides,
});

beforeEach(async () => {
  await db.tourState.clear();
});

describe('getTourState', () => {
  it('returns undefined when no tour state exists', async () => {
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});

describe('saveTourState', () => {
  it('saves and retrieves tour state', async () => {
    const state = makeState({ seenFeatures: ['feat1'], coreCompleted: true });
    await saveTourState(state);
    const retrieved = await getTourState(USER_ID);
    expect(retrieved).toEqual(state);
  });
});

describe('markCoreCompleted', () => {
  it('marks core completed when state exists', async () => {
    await saveTourState(makeState({ coreCompleted: false }));
    await markCoreCompleted(USER_ID);
    const state = await getTourState(USER_ID);
    expect(state?.coreCompleted).toBe(true);
  });

  it('does nothing (no-op) when state does not exist', async () => {
    await expect(markCoreCompleted(USER_ID)).resolves.toBeUndefined();
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});

describe('markExtendedCompleted', () => {
  it('marks extended completed when state exists', async () => {
    await saveTourState(makeState({ coreCompleted: true, extendedCompleted: false }));
    await markExtendedCompleted(USER_ID);
    const state = await getTourState(USER_ID);
    expect(state?.extendedCompleted).toBe(true);
  });

  it('does nothing (no-op) when state does not exist', async () => {
    await expect(markExtendedCompleted(USER_ID)).resolves.toBeUndefined();
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});

describe('markFeaturesRead', () => {
  it('marks features as read', async () => {
    await saveTourState(makeState({ seenFeatures: ['old'], coreCompleted: true, extendedCompleted: true }));
    await markFeaturesRead(USER_ID, ['new1', 'new2']);
    const state = await getTourState(USER_ID);
    expect(state?.seenFeatures).toEqual(['old', 'new1', 'new2']);
  });

  it('deduplicates features already in seenFeatures', async () => {
    await saveTourState(makeState({ seenFeatures: ['feat1', 'feat2'] }));
    await markFeaturesRead(USER_ID, ['feat1', 'feat3']);
    const state = await getTourState(USER_ID);
    expect(state?.seenFeatures).toEqual(['feat1', 'feat2', 'feat3']);
  });

  it('does nothing (no-op) when state does not exist', async () => {
    await expect(markFeaturesRead(USER_ID, ['feat1'])).resolves.toBeUndefined();
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});

describe('updateCompletedVersion', () => {
  it('updates completed version when state exists', async () => {
    await saveTourState(makeState({ completedVersion: '1.0.0', coreCompleted: true, extendedCompleted: true }));
    await updateCompletedVersion(USER_ID, '1.1.0');
    const state = await getTourState(USER_ID);
    expect(state?.completedVersion).toBe('1.1.0');
  });

  it('does nothing (no-op) when state does not exist', async () => {
    await expect(updateCompletedVersion(USER_ID, '1.1.0')).resolves.toBeUndefined();
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});

describe('resetTourState', () => {
  it('resets coreCompleted and extendedCompleted to false', async () => {
    await saveTourState(makeState({ seenFeatures: ['feat1'], coreCompleted: true, extendedCompleted: true }));
    await resetTourState(USER_ID);
    const state = await getTourState(USER_ID);
    expect(state?.coreCompleted).toBe(false);
    expect(state?.extendedCompleted).toBe(false);
  });

  it('does nothing (no-op) when state does not exist', async () => {
    await expect(resetTourState(USER_ID)).resolves.toBeUndefined();
    const state = await getTourState(USER_ID);
    expect(state).toBeUndefined();
  });
});
