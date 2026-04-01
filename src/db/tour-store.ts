import { db } from './database';
import type { TourState } from '@/shared/types';

export async function getTourState(userId: string): Promise<TourState | undefined> {
  return db.tourState.get(userId);
}

export async function saveTourState(state: TourState): Promise<void> {
  await db.tourState.put(state);
}

export async function markCoreCompleted(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, coreCompleted: true });
  }
}

export async function markExtendedCompleted(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, extendedCompleted: true });
  }
}

export async function markFeaturesRead(userId: string, featureKeys: string[]): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    const merged = [...state.seenFeatures, ...featureKeys.filter((k) => !state.seenFeatures.includes(k))];
    await saveTourState({ ...state, seenFeatures: merged });
  }
}

export async function updateCompletedVersion(userId: string, version: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, completedVersion: version });
  }
}

export async function resetTourState(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, coreCompleted: false, extendedCompleted: false });
  }
}
