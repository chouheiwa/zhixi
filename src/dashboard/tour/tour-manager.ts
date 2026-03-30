import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour-theme.css';
import {
  CORE_STEPS,
  EXTENDED_STEPS,
  FEATURE_CHANGELOG,
  type FeatureEntry,
} from './tour-config';
import type { TourState } from '@/shared/types';

export function shouldShowTour(
  tourState: TourState | undefined,
): 'core' | 'extended' | 'new-features' | null {
  if (!tourState) return 'core';
  if (!tourState.coreCompleted) return 'core';
  if (!tourState.extendedCompleted) return 'extended';

  const newFeatures = getNewFeatures(tourState);
  if (newFeatures.length > 0) return 'new-features';

  return null;
}

export function getNewFeatures(tourState: TourState): FeatureEntry[] {
  const unseen: FeatureEntry[] = [];
  for (const [version, features] of Object.entries(FEATURE_CHANGELOG)) {
    if (version > tourState.completedVersion) {
      for (const feat of features) {
        if (!tourState.seenFeatures.includes(feat.key)) {
          unseen.push(feat);
        }
      }
    }
  }
  return unseen;
}

export function startCoreTour(onComplete: () => void): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: CORE_STEPS,
    onDestroyed: onComplete,
  });
  d.drive();
}

export function startExtendedTour(onComplete: () => void): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: EXTENDED_STEPS,
    onDestroyed: onComplete,
  });
  d.drive();
}

export function startNewFeatureTour(
  features: FeatureEntry[],
  onComplete: () => void,
): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: features.map(f => f.step),
    onDestroyed: onComplete,
  });
  d.drive();
}
