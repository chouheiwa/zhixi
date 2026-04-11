import React from 'react';
import type { DailySummary, IncomeRecord, TabConfig } from '@/shared/types';
import type { ContentTableItem } from './components/ContentTable';

const DailyTrendChart = React.lazy(() =>
  import('./components/DailyTrendChart').then((m) => ({ default: m.DailyTrendChart })),
);
const RPMForecastPanel = React.lazy(() =>
  import('./components/RPMForecastPanel').then((m) => ({ default: m.RPMForecastPanel })),
);
const WeeklySeasonalityChart = React.lazy(() =>
  import('./components/WeeklySeasonalityChart').then((m) => ({ default: m.WeeklySeasonalityChart })),
);
const AnomalyDetectionPanel = React.lazy(() =>
  import('./components/AnomalyDetectionPanel').then((m) => ({ default: m.AnomalyDetectionPanel })),
);
const ContentTypeComparisonPanel = React.lazy(() =>
  import('./components/ContentTypeComparisonPanel').then((m) => ({ default: m.ContentTypeComparisonPanel })),
);
const PublishTimeAnalysis = React.lazy(() =>
  import('./components/PublishTimeAnalysis').then((m) => ({ default: m.PublishTimeAnalysis })),
);
const MultiDimensionRanking = React.lazy(() =>
  import('./components/MultiDimensionRanking').then((m) => ({ default: m.MultiDimensionRanking })),
);
const IncomeGoalPanel = React.lazy(() =>
  import('./components/IncomeGoalPanel').then((m) => ({ default: m.IncomeGoalPanel })),
);
const MLPredictionPanel = React.lazy(() =>
  import('./components/MLPredictionPanel').then((m) => ({ default: m.MLPredictionPanel })),
);
const UnmonetizedContentPanel = React.lazy(() =>
  import('./components/UnmonetizedContentPanel').then((m) => ({ default: m.UnmonetizedContentPanel })),
);

type RankedContentItem = Pick<ContentTableItem, 'contentId' | 'contentToken' | 'contentType' | 'title' | 'publishDate'>;

export interface DashboardContext {
  userId: string;
  demoMode: boolean;
  mlDemoStep?: number;
  onMlDemoAnimating?: (animating: boolean) => void;
  allSummaries: DailySummary[];
  allDateRange: { start: string; end: string };
  allIncomeRecords: IncomeRecord[];
  records: IncomeRecord[];
  monetizedContentIds: Set<string>;
  monetizedContentTokens: Set<string>;
  monthIncome: number;
  monthDaysElapsed: number;
  monthDaysTotal: number;
  onContentClick: (item: ContentTableItem) => void;
}

export interface PanelMeta {
  key: string;
  label: string;
  tab: string;
  defaultOrder: number;
  defaultVisible: boolean;
  render: (ctx: DashboardContext) => React.ReactNode;
}

const panelRegistry: PanelMeta[] = [
  {
    key: 'incomeGoal',
    label: '收益目标',
    tab: 'overview',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(IncomeGoalPanel, {
          userId: ctx.userId,
          monthIncome: ctx.monthIncome,
          monthDaysElapsed: ctx.monthDaysElapsed,
          monthDaysTotal: ctx.monthDaysTotal,
        }),
      ),
  },
  {
    key: 'dailyTrend',
    label: '日趋势图',
    tab: 'overview',
    defaultOrder: 1,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(DailyTrendChart, {
          summaries: ctx.allSummaries,
          startDate: ctx.allDateRange.start,
          endDate: ctx.allDateRange.end,
        }),
      ),
  },
  {
    key: 'contentTypeComparison',
    label: '文章vs回答',
    tab: 'overview',
    defaultOrder: 2,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(ContentTypeComparisonPanel, { records: ctx.allIncomeRecords }),
      ),
  },
  {
    key: 'rpm',
    label: 'RPM分析',
    tab: 'overview',
    defaultOrder: 3,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(RPMForecastPanel, {
          summaries: ctx.allSummaries,
          startDate: ctx.allDateRange.start,
          endDate: ctx.allDateRange.end,
        }),
      ),
  },
  {
    key: 'weeklySeasonality',
    label: '周期性分析',
    tab: 'overview',
    defaultOrder: 4,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(WeeklySeasonalityChart, { summaries: ctx.allSummaries }),
      ),
  },
  {
    key: 'publishTimeAnalysis',
    label: '发布时间分析',
    tab: 'overview',
    defaultOrder: 5,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(PublishTimeAnalysis, { records: ctx.allIncomeRecords }),
      ),
  },
  {
    key: 'multiDimensionRanking',
    label: '多维度排行',
    tab: 'overview',
    defaultOrder: 6,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(MultiDimensionRanking, {
          records: ctx.allIncomeRecords,
          onContentClick: (item: RankedContentItem) =>
            ctx.onContentClick({
              ...item,
              currentIncome: 0,
              currentRead: 0,
              currentInteraction: 0,
            }),
        }),
      ),
  },
  {
    key: 'anomalyDetection',
    label: '异常检测',
    tab: 'overview',
    defaultOrder: 7,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(AnomalyDetectionPanel, {
          summaries: ctx.allSummaries,
          startDate: ctx.allDateRange.start,
          endDate: ctx.allDateRange.end,
        }),
      ),
  },
  {
    key: 'mlPrediction',
    label: '智能分析',
    tab: 'ml',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(MLPredictionPanel, {
          records: ctx.records,
          demoMode: ctx.demoMode,
          demoStep: ctx.mlDemoStep,
          onDemoAnimating: ctx.onMlDemoAnimating,
        }),
      ),
  },
  {
    key: 'unmonetizedContent',
    label: '未产生收益',
    tab: 'unmonetized',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) =>
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(UnmonetizedContentPanel, {
          monetizedContentTokens: ctx.monetizedContentTokens,
          demoMode: ctx.demoMode,
        }),
      ),
  },
];

export function getPanelRegistry(): PanelMeta[] {
  return panelRegistry;
}

export function getPanelsByTab(tab: string): PanelMeta[] {
  return panelRegistry.filter((p) => p.tab === tab);
}

export function getDefaultTabs(): TabConfig[] {
  const tabOrder: { key: string; label: string }[] = [
    { key: 'overview', label: '总览' },
    { key: 'ml', label: '智能分析' },
    { key: 'unmonetized', label: '未产生收益' },
    { key: 'content', label: '内容明细' },
  ];

  return tabOrder.map((t, idx) => ({
    key: t.key,
    label: t.label,
    visible: true,
    order: idx,
    panels: getPanelsByTab(t.key).map((p) => ({
      key: p.key,
      visible: p.defaultVisible,
      order: p.defaultOrder,
    })),
  }));
}

export function getPanelMeta(key: string): PanelMeta | undefined {
  return panelRegistry.find((p) => p.key === key);
}
