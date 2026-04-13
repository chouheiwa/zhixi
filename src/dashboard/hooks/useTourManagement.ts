import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from 'antd';
import type { TourState, DailySummary, IncomeRecord } from '@/shared/types';
import {
  getTourState,
  saveTourState,
  markCoreCompleted,
  markExtendedCompleted,
  markFeaturesRead,
  updateCompletedVersion,
  resetTourState,
} from '@/db/tour-store';
import {
  getNewFeatures,
  startCoreTour,
  startExtendedTour,
  startNewFeatureTour,
  type TourCallbacks,
} from '../tour/tour-manager';
import { TOUR_VERSION } from '../tour/tour-config';
import { getDemoSummaries, getDemoRecords } from '../tour/demo-data';

interface UseTourManagementParams {
  userId: string | undefined;
  allSummaries: DailySummary[];
  allIncomeRecords: IncomeRecord[];
  tourCallbacks: TourCallbacks;
}

export function useTourManagement({ userId, allSummaries, allIncomeRecords, tourCallbacks }: UseTourManagementParams) {
  const [tourState, setTourState] = useState<TourState | undefined>(undefined);
  const [tourLoaded, setTourLoaded] = useState(false);
  const [showNewFeatureBanner, setShowNewFeatureBanner] = useState(false);
  const [newFeatureCount, setNewFeatureCount] = useState(0);
  const [tourActive, setTourActive] = useState(false);
  const [pendingTour, setPendingTour] = useState(false);

  // First visit: tour state loaded but no record exists
  const isFirstVisit = tourLoaded && !tourState;

  // Load tour state
  useEffect(() => {
    if (!userId) return;
    getTourState(userId).then((state) => {
      setTourState(state);
      setTourLoaded(true);
      if (state) {
        const features = getNewFeatures(state);
        if (features.length > 0) {
          setNewFeatureCount(features.length);
          setShowNewFeatureBanner(true);
        }
      }
    });
  }, [userId]);

  // Core tour launcher (shared by first-time and manual restart)
  const launchCoreTour = useCallback(() => {
    if (!userId) return;
    const onTourEnd = () => setTourActive(false);
    startCoreTour(tourCallbacks, () => {
      markCoreCompleted(userId).then(() => {
        setTourState((prev) => (prev ? { ...prev, coreCompleted: true } : prev));
        Modal.confirm({
          title: '基础功能介绍完毕',
          content: '要继续了解高级分析功能吗？也可以稍后在设置菜单中重新查看。',
          okText: '继续探索',
          cancelText: '稍后再看',
          onOk: () => {
            startExtendedTour(tourCallbacks, () => {
              markExtendedCompleted(userId);
              setTourState((prev) => (prev ? { ...prev, extendedCompleted: true } : prev));
              onTourEnd();
            });
          },
          onCancel: onTourEnd,
        });
      });
    });
  }, [userId, tourCallbacks]);

  // Launch tour after DOM has updated (double-raf ensures paint completion)
  useEffect(() => {
    if (!pendingTour || !userId) return;
    let cancelled = false;
    const outerRafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        launchCoreTour();
        setPendingTour(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRafId);
    };
  }, [pendingTour, userId, launchCoreTour]);

  // Called by Dashboard after user confirms first-time setup
  const startFirstTimeTour = useCallback(() => {
    if (!userId) return;
    const initialState: TourState = {
      userId,
      completedVersion: TOUR_VERSION,
      seenFeatures: [],
      coreCompleted: false,
      extendedCompleted: false,
    };
    saveTourState(initialState).then(() => {
      setTourState(initialState);
      setTourActive(true);
      setPendingTour(true);
    });
  }, [userId]);

  // Manual restart from settings menu
  const handleStartTour = useCallback(() => {
    if (!userId) return;
    resetTourState(userId).then(() => {
      setTourState((prev) => (prev ? { ...prev, coreCompleted: false, extendedCompleted: false } : prev));
      setTourActive(true);
      setPendingTour(true);
    });
  }, [userId]);

  const handleViewNewFeatures = () => {
    if (!userId || !tourState) return;
    const features = getNewFeatures(tourState);
    setShowNewFeatureBanner(false);
    startNewFeatureTour(features, () => {
      const featureKeys = features.map((f) => f.key);
      markFeaturesRead(userId, featureKeys);
      updateCompletedVersion(userId, TOUR_VERSION);
      setTourState((prev) =>
        prev ? { ...prev, seenFeatures: [...prev.seenFeatures, ...featureKeys], completedVersion: TOUR_VERSION } : prev,
      );
    });
  };

  const handleDismissNewFeatures = () => {
    if (!userId || !tourState) return;
    setShowNewFeatureBanner(false);
    const features = getNewFeatures(tourState);
    const featureKeys = features.map((f) => f.key);
    markFeaturesRead(userId, featureKeys);
    updateCompletedVersion(userId, TOUR_VERSION);
    setTourState((prev) =>
      prev ? { ...prev, seenFeatures: [...prev.seenFeatures, ...featureKeys], completedVersion: TOUR_VERSION } : prev,
    );
  };

  // Demo data logic: always use demo data during tour for consistent experience
  const useDemo = tourActive;
  const effectiveSummaries = useDemo ? getDemoSummaries() : allSummaries;
  const effectiveRecords = useDemo ? getDemoRecords() : allIncomeRecords;
  const effectiveDateRange = useMemo(() => {
    if (effectiveSummaries.length === 0) return { start: '', end: '' };
    return { start: effectiveSummaries[0].date, end: effectiveSummaries[effectiveSummaries.length - 1].date };
  }, [effectiveSummaries]);

  return {
    isFirstVisit,
    tourActive,
    useDemo,
    effectiveSummaries,
    effectiveRecords,
    effectiveDateRange,
    showNewFeatureBanner,
    newFeatureCount,
    startFirstTimeTour,
    handleStartTour,
    handleViewNewFeatures,
    handleDismissNewFeatures,
  };
}
