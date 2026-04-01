import type { DriveStep } from 'driver.js';

export const TOUR_VERSION = '1.0.0';

export const CORE_STEPS: DriveStep[] = [
  {
    element: '#tour-settings-menu',
    popover: {
      title: '设置菜单',
      description: '这是你的控制中心。在这里可以同步收益数据、拉取内容详情、导出 Excel 报告、自定义面板布局、查看成就记录等。首次使用请先点击"同步数据"开始采集。',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '#tour-summary-cards',
    popover: {
      title: '收益概览',
      description: '三张卡片分别展示昨日、本月和累计的核心数据：收益金额、阅读量和内容数量。其中"总览"卡片还会显示你的整体 RPM（每千次阅读收益），帮助你快速评估变现效率。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-incomeGoal',
    popover: {
      title: '收益目标',
      description: '在这里设定月度收益目标。面板会显示当前进度条、日均收益、按当前趋势的预估完成情况。你可以随时修改目标金额，数据会自动保存。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-dailyTrend',
    popover: {
      title: '每日趋势',
      description: '两张图表分别展示阅读量和互动量的每日变化，叠加了收益柱状图方便对比。图表底部有滑动条，可以拖动查看更长的历史区间，也支持鼠标滚轮缩放。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-contentTypeComparison',
    popover: {
      title: '文章 vs 回答',
      description: '对比你的文章和回答在收益、阅读量、RPM 等维度的表现差异。帮助你判断哪种内容形式更适合变现，以便调整创作策略。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-rpm',
    popover: {
      title: 'RPM 趋势（每千次阅读收益）',
      description: 'RPM = (当日收益 ÷ 当日阅读量) × 1000，衡量每 1000 次阅读能带来多少收益。柱状图显示每日 RPM，橙色趋势线是 7 日指数移动平均（EMA），帮你过滤日常波动看清长期趋势。RPM 越高说明内容变现效率越好。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-tab-bar',
    popover: {
      title: '更多分析维度',
      description: '除了"总览"Tab，还有"智能分析"（基于机器学习的收益预测和异常检测）、"未产生收益"（找出哪些内容还未被推荐变现）、"内容明细"（逐篇查看每篇内容的详细数据）。',
      side: 'bottom',
      align: 'start',
    },
  },
];

export const EXTENDED_STEPS: DriveStep[] = [
  {
    element: '#tour-weeklySeasonality',
    popover: {
      title: '周维度分析',
      description: '按周一到周日分析你的阅读量和收益分布规律，发现一周中哪几天表现最好。还会展示按周汇总的趋势变化。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-publishTimeAnalysis',
    popover: {
      title: '最佳发布时间',
      description: '统计你在不同时间段发布的内容，其首周收益表现如何。帮你找到最佳发布时机，让新内容获得更好的初始曝光。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-multiDimensionRanking',
    popover: {
      title: '多维度排行榜',
      description: '从四个维度为你的内容排名：总收益最高、RPM 最高（变现效率）、增长最快（近期表现）、互动率最高。快速找到你的"明星内容"。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-anomalyDetection',
    popover: {
      title: '异常检测',
      description: '自动识别收益或阅读量出现异常波动的日期，用红色/绿色标记显著下降和上升。帮你及时发现问题或抓住爆款机会。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-settings-menu',
    popover: {
      title: '更多功能提醒',
      description: '别忘了在设置菜单中探索：📊 导出 Excel 报告可生成包含摘要、每日汇总、内容明细的多 Sheet 报表；🏆 成就记录追踪你的收益里程碑；🎨 自定义布局可以拖拽排列面板顺序、显示或隐藏不需要的面板。',
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
