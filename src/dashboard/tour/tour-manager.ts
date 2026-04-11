import { driver } from 'driver.js';
import type { DriveStep } from 'driver.js';
import { flushSync } from 'react-dom';
import 'driver.js/dist/driver.css';
import './tour-theme.css';
import { CORE_STEPS, EXTENDED_STEPS, FEATURE_CHANGELOG, type FeatureEntry, type TourStep } from './tour-config';
import type { TourState } from '@/shared/types';

const DRIVER_BASE_CONFIG = {
  showProgress: true,
  progressText: '第 {{current}} 步 / 共 {{total}} 步',
  nextBtnText: '下一步',
  prevBtnText: '上一步',
  doneBtnText: '完成',
} as const;

function buildDriverSteps(tourSteps: TourStep[], switchTab: (tabKey: string) => void): DriveStep[] {
  return tourSteps.map((tourStep) => {
    if (tourStep.tab) {
      return {
        ...tourStep.step,
        onHighlightStarted: () => {
          flushSync(() => switchTab(tourStep.tab!));
        },
      };
    }
    return tourStep.step;
  });
}

export function shouldShowTour(tourState: TourState | undefined): 'core' | 'extended' | 'new-features' | null {
  if (!tourState) return 'core';
  if (!tourState.coreCompleted) return 'core';
  if (!tourState.extendedCompleted) return 'extended';

  const newFeatures = getNewFeatures(tourState);
  if (newFeatures.length > 0) return 'new-features';

  return null;
}

function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [a1, a2 = 0, a3 = 0] = parse(candidate);
  const [b1, b2 = 0, b3 = 0] = parse(current);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

export function getNewFeatures(tourState: TourState): FeatureEntry[] {
  const unseen: FeatureEntry[] = [];
  for (const [version, features] of Object.entries(FEATURE_CHANGELOG)) {
    if (isNewerVersion(version, tourState.completedVersion)) {
      for (const feat of features) {
        if (!tourState.seenFeatures.includes(feat.key)) {
          unseen.push(feat);
        }
      }
    }
  }
  return unseen;
}

export function startCoreTour(switchTab: (tabKey: string) => void, onComplete: () => void): void {
  const d = driver({
    ...DRIVER_BASE_CONFIG,
    steps: buildDriverSteps(CORE_STEPS, switchTab),
    onDestroyed: () => {
      switchTab('overview');
      onComplete();
    },
  });
  d.drive();
}

export function startExtendedTour(switchTab: (tabKey: string) => void, onComplete: () => void): void {
  const d = driver({
    ...DRIVER_BASE_CONFIG,
    steps: buildDriverSteps(EXTENDED_STEPS, switchTab),
    onDestroyed: () => {
      switchTab('overview');
      onComplete();
    },
  });
  d.drive();
}

export function startNewFeatureTour(features: FeatureEntry[], onComplete: () => void): void {
  const d = driver({
    ...DRIVER_BASE_CONFIG,
    steps: features.map((f) => f.step),
    onDestroyed: onComplete,
  });
  d.drive();
}
