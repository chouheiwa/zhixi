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
  disableActiveInteraction: true,
} as const;

export interface TourCallbacks {
  switchTab: (tabKey: string) => void;
  onAction?: (action: string) => void;
}

function buildDriverSteps(tourSteps: TourStep[], callbacks: TourCallbacks): DriveStep[] {
  return tourSteps.map((tourStep) => {
    const needsPreAction = tourStep.tab || tourStep.action;
    if (!needsPreAction) return tourStep.step;
    const { element: selector, ...rest } = tourStep.step;
    return {
      ...rest,
      // driver.js resolves the element BEFORE calling onHighlightStarted,
      // so we use the function form of `element` to run actions first,
      // ensuring the target DOM node exists when driver.js queries it.
      element: () => {
        flushSync(() => {
          if (tourStep.action) callbacks.onAction?.(tourStep.action);
          if (tourStep.tab) callbacks.switchTab(tourStep.tab);
        });
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        return (el as Element) ?? document.body;
      },
    };
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

export function startCoreTour(callbacks: TourCallbacks, onComplete: () => void): void {
  const d = driver({
    ...DRIVER_BASE_CONFIG,
    steps: buildDriverSteps(CORE_STEPS, callbacks),
    onDestroyed: () => {
      callbacks.onAction?.('hide-content-detail');
      callbacks.switchTab('overview');
      onComplete();
    },
  });
  d.drive();
}

export function startExtendedTour(callbacks: TourCallbacks, onComplete: () => void): void {
  const d = driver({
    ...DRIVER_BASE_CONFIG,
    steps: buildDriverSteps(EXTENDED_STEPS, callbacks),
    onDestroyed: () => {
      callbacks.onAction?.('ml-demo-reset');
      callbacks.switchTab('overview');
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
