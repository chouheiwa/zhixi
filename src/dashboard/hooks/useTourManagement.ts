import { useState, useEffect, useRef, useMemo } from 'react';
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
import { getNewFeatures, startCoreTour, startExtendedTour, startNewFeatureTour } from '../tour/tour-manager';
import { TOUR_VERSION } from '../tour/tour-config';
import { getDemoSummaries, getDemoRecords } from '../tour/demo-data';

interface UseTourManagementParams {
  userId: string | undefined;
  allSummaries: DailySummary[];
  allIncomeRecords: IncomeRecord[];
}

export function useTourManagement({ userId, allSummaries, allIncomeRecords }: UseTourManagementParams) {
  const [tourState, setTourState] = useState<TourState | undefined>(undefined);
  const [tourLoaded, setTourLoaded] = useState(false);
  const [showNewFeatureBanner, setShowNewFeatureBanner] = useState(false);
  const [newFeatureCount, setNewFeatureCount] = useState(0);
  const [tourActive, setTourActive] = useState(false);
  const tourLaunchingRef = useRef(false);

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

  // Auto-trigger first-time tour
  useEffect(() => {
    if (!userId || !tourLoaded) return;
    if (!tourState && !tourLaunchingRef.current) {
      tourLaunchingRef.current = true;
      const onTourEnd = () => setTourActive(false);
      const timer = setTimeout(() => {
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
          startCoreTour(() => {
            markCoreCompleted(userId).then(() => {
              setTourState((prev) => (prev ? { ...prev, coreCompleted: true } : prev));
              Modal.confirm({
                title: '还有更多功能可以探索',
                content: '要继续了解更多高级功能吗？也可以稍后在设置菜单中查看。',
                okText: '继续探索',
                cancelText: '稍后再看',
                onOk: () => {
                  startExtendedTour(() => {
                    markExtendedCompleted(userId);
                    setTourState((prev) => (prev ? { ...prev, extendedCompleted: true } : prev));
                    onTourEnd();
                  });
                },
                onCancel: onTourEnd,
              });
            });
          });
        });
      }, 800);
      return () => {
        clearTimeout(timer);
        tourLaunchingRef.current = false;
      };
    }
  }, [userId, tourLoaded, tourState]);

  const handleStartTour = () => {
    if (!userId) return;
    resetTourState(userId).then(() => {
      setTourState((prev) => (prev ? { ...prev, coreCompleted: false, extendedCompleted: false } : prev));
      setTourActive(true);
      const onTourEnd = () => setTourActive(false);
      startCoreTour(() => {
        markCoreCompleted(userId);
        setTourState((prev) => (prev ? { ...prev, coreCompleted: true } : prev));
        Modal.confirm({
          title: '还有更多功能可以探索',
          content: '要继续了解更多高级功能吗？也可以稍后在设置菜单中查看。',
          okText: '继续探索',
          cancelText: '稍后再看',
          onOk: () => {
            startExtendedTour(() => {
              markExtendedCompleted(userId);
              setTourState((prev) => (prev ? { ...prev, extendedCompleted: true } : prev));
              onTourEnd();
            });
          },
          onCancel: onTourEnd,
        });
      });
    });
  };

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

  // Demo data logic
  const useDemo = tourActive && allSummaries.length === 0;
  const effectiveSummaries = useDemo ? getDemoSummaries() : allSummaries;
  const effectiveRecords = useDemo ? getDemoRecords() : allIncomeRecords;
  const effectiveDateRange = useMemo(() => {
    if (effectiveSummaries.length === 0) return { start: '', end: '' };
    return { start: effectiveSummaries[0].date, end: effectiveSummaries[effectiveSummaries.length - 1].date };
  }, [effectiveSummaries]);

  return {
    tourActive,
    useDemo,
    effectiveSummaries,
    effectiveRecords,
    effectiveDateRange,
    showNewFeatureBanner,
    newFeatureCount,
    handleStartTour,
    handleViewNewFeatures,
    handleDismissNewFeatures,
  };
}
