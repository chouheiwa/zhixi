import type { DriveStep } from 'driver.js';

export const TOUR_VERSION = '1.0.0';

export const CORE_STEPS: DriveStep[] = [
  {
    element: '#tour-sync-button',
    popover: {
      title: '同步数据',
      description: '点击这里从知乎同步最新的收益数据，首次使用请先完成同步。',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-summary-cards',
    popover: {
      title: '收益概览',
      description: '这里展示昨日、本月和累计收益数据，帮助你快速了解整体收益状况。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-daily-trend',
    popover: {
      title: '每日趋势',
      description: '查看阅读量和收益的每日变化趋势，支持缩放和拖动查看历史数据。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-tab-bar',
    popover: {
      title: '分析维度',
      description: '切换不同 Tab 查看智能分析、内容明细等更多分析维度。',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-settings-menu',
    popover: {
      title: '设置菜单',
      description: '在这里可以自定义面板布局、导出数据报告、查看成就记录等更多功能。',
      side: 'bottom',
      align: 'end',
    },
  },
];

export const EXTENDED_STEPS: DriveStep[] = [
  {
    element: '#tour-incomeGoal',
    popover: {
      title: '收益目标',
      description: '设定月度收益目标，追踪完成进度，查看是否能按期达成。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-rpm',
    popover: {
      title: 'RPM 趋势',
      description: '追踪每千次阅读收益效率（RPM），评估你的内容变现能力变化。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-settings-menu',
    popover: {
      title: '更多功能',
      description: '在设置菜单中还可以查看成就记录、导出 Excel 报告、导入导出数据等。',
      side: 'bottom',
      align: 'end',
    },
  },
];

export interface FeatureEntry {
  key: string;
  step: DriveStep;
}

export const FEATURE_CHANGELOG: Record<string, FeatureEntry[]> = {
  '1.0.0': [],
};
