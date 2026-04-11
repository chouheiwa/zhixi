import type { DriveStep } from 'driver.js';

export const TOUR_VERSION = '1.0.0';

export interface TourStep {
  tab?: string; // 'overview' | 'ml' | 'unmonetized' | 'content'
  step: DriveStep;
}

export const CORE_STEPS: TourStep[] = [
  {
    step: {
      element: '#tour-settings-menu',
      popover: {
        title: '设置菜单',
        description:
          '这是你的控制中心。在这里可以同步收益数据、导出报告、自定义面板布局、查看成就记录。首次使用请先同步数据。随时可以在这里重新查看功能介绍。',
        side: 'bottom',
        align: 'end',
      },
    },
  },
  {
    step: {
      element: '#tour-summary-cards',
      popover: {
        title: '收益概览',
        description:
          '三张卡片分别展示昨日、本月和累计的核心数据：收益金额、阅读量和内容数量。"总览"卡片还会显示整体 RPM（每千次阅读收益）。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-incomeGoal',
      popover: {
        title: '收益目标',
        description: '设定月度收益目标，面板会显示进度条、日均收益和按当前趋势的预估完成情况。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-dailyTrend',
      popover: {
        title: '每日趋势',
        description: '阅读量和互动量的每日变化图表，叠加了收益柱状图。支持拖动滑块和鼠标滚轮缩放查看更长历史区间。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    step: {
      element: '#tour-tab-bar',
      popover: {
        title: '更多分析维度',
        description:
          '除了"总览"，还有"智能分析"、"未产生收益"和"内容明细"三个标签页，分别提供不同的数据分析视角。接下来带你快速了解。',
        side: 'bottom',
        align: 'start',
      },
    },
  },
  {
    tab: 'ml',
    step: {
      element: '#tour-mlPrediction',
      popover: {
        title: '智能分析',
        description:
          '基于机器学习模型预测内容收益趋势。同步足够数据后可开始训练，获得各内容的收益预测和模型准确度评估。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'unmonetized',
    step: {
      element: '#tour-unmonetizedContent',
      popover: {
        title: '未产生收益',
        description: '找出你发布的内容中尚未被推荐变现的部分，帮助你了解哪些内容有潜力但还没有产生收益。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'content',
    step: {
      element: '#tour-content-table',
      popover: {
        title: '内容明细',
        description: '逐篇查看每篇内容的收益数据，支持按收益、阅读量等排序和按内容类型筛选。点击任意内容可进入详情页。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'content',
    step: {
      element: '#tour-content-actions',
      popover: {
        title: '操作功能',
        description: '可以选择多篇内容进行对比分析，还可以批量拉取内容的每日详情数据。',
        side: 'top',
        align: 'center',
      },
    },
  },
];

export const EXTENDED_STEPS: TourStep[] = [
  {
    tab: 'overview',
    step: {
      element: '#tour-contentTypeComparison',
      popover: {
        title: '文章 vs 回答',
        description: '对比文章和回答在收益、阅读量、RPM 等维度的表现差异，帮助判断哪种内容形式更适合变现。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-rpm',
      popover: {
        title: 'RPM 分析',
        description:
          'RPM = (当日收益 ÷ 当日阅读量) × 1000，衡量每千次阅读带来的收益。柱状图显示每日 RPM，橙色趋势线是 7 日移动平均。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-weeklySeasonality',
      popover: {
        title: '周期性分析',
        description: '按周一到周日分析阅读量和收益分布规律，发现一周中哪几天表现最好。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-publishTimeAnalysis',
      popover: {
        title: '最佳发布时间',
        description: '统计不同时间段发布的内容首周收益表现，帮你找到最佳发布时机。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-multiDimensionRanking',
      popover: {
        title: '多维度排行',
        description: '从总收益、RPM、增长速度、互动率四个维度为内容排名，快速找到"明星内容"。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-anomalyDetection',
      popover: {
        title: '异常检测',
        description: '自动识别收益或阅读量异常波动的日期，用红/绿标记显著变化，帮你及时发现问题或抓住机会。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    tab: 'overview',
    step: {
      element: '#tour-settings-menu',
      popover: {
        title: '更多功能',
        description:
          '📊 导出 Excel 多 Sheet 报表 · 🏆 成就记录追踪收益里程碑 · 🎨 自定义布局拖拽排列面板 · 📖 随时重新查看功能介绍',
        side: 'bottom',
        align: 'end',
      },
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
