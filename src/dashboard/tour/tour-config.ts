import type { DriveStep } from 'driver.js';

export const TOUR_VERSION = '1.0.1';

export interface TourStep {
  tab?: string; // 'overview' | 'ml' | 'unmonetized' | 'content'
  action?: string; // custom action key, e.g. 'show-content-detail' | 'hide-content-detail'
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
          '除了"总览"，还有"智能分析"、"未产生收益内容"和"有收益内容明细"三个标签页，分别提供不同的数据分析视角。接下来带你快速了解。',
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
        title: '智能分析（早期实验阶段）',
        description: '基于机器学习预测内容收益。同步足够数据后可训练模型，稍后在高级引导中可以体验完整的训练演示流程。',
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
        title: '未产生收益内容',
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
        title: '有收益内容明细',
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
        title: '日期筛选与操作',
        description:
          '右上角可以选择日期范围筛选数据。在表格中勾选内容后，会出现「批量拉取详情」和「对比」按钮，支持多篇内容对比分析。',
        side: 'bottom',
        align: 'end',
      },
    },
  },
  {
    action: 'show-content-detail',
    step: {
      element: '#tour-detail-stats',
      popover: {
        title: '内容详情 · 核心指标',
        description:
          '进入详情页后，顶部展示该内容的总收益、千次阅读收益（RPM）、总阅读量、总互动量等核心数据，以及点赞和评论的累计数。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    step: {
      element: '#tour-detail-income-trend',
      popover: {
        title: '内容详情 · 收益趋势',
        description:
          '每日收益柱状图展示该内容的收益变化趋势。下方还有生命周期分析，帮你了解内容从发布到稳定的收益衰减规律。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    step: {
      element: '#tour-detail-tabs',
      popover: {
        title: '内容详情 · 更多数据',
        description:
          '切换到「每日数据详情」标签页，可以查看阅读量、曝光量、点赞、评论、收藏、分享六个维度的每日变化图表，每张图还叠加了收益对比。',
        side: 'top',
        align: 'start',
      },
    },
  },
  {
    action: 'hide-content-detail',
    step: {
      element: '#tour-tab-bar',
      popover: {
        title: '继续探索',
        description: '以上就是基础功能的介绍。你可以随时在设置菜单中重新查看功能引导。',
        side: 'bottom',
        align: 'start',
      },
    },
  },
];

export const ML_DEMO_STEPS: TourStep[] = [
  {
    tab: 'ml',
    action: 'ml-demo-0',
    step: {
      element: '#tour-mlPrediction',
      popover: {
        title: '第 1 步：准备数据',
        description:
          '训练前需要准备特征数据。每条数据是某篇内容在某天的表现，包含阅读量、点赞、评论、收藏等 19 个特征，目标是预测当天的实际收益。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-1',
    step: {
      element: '#ml-training-steps',
      popover: {
        title: '第 2 步：随机森林',
        description:
          '第一个模型：随机森林。200 棵决策树各自独立预测，然后投票取平均。擅长捕捉"阅读量超过某个值后收益明显提升"这类阈值效应。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-2',
    step: {
      element: '#ml-training-steps',
      popover: {
        title: '第 3 步：岭回归',
        description:
          '第二个模型：岭回归。一种带正则化的线性模型，擅长捕捉"阅读量每增加 1000，收益大约增加 X 元"这类线性趋势。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-3',
    step: {
      element: '#ml-training-neural',
      popover: {
        title: '第 4 步：神经网络',
        description:
          '第三个模型：四层神经网络（128→64→32→16→1）。左侧曲线显示训练过程中的 loss 变化，loss 越低说明预测越准。请等待动画完成后继续。',
        side: 'right',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-4',
    step: {
      element: '#ml-training-steps',
      popover: {
        title: '第 5 步：集成计算',
        description:
          '三个模型训练完毕，现在按各自的准确度分配权重。准确度越高的模型获得越大的权重，这样即使某个模型预测偏了，其他模型也能拉回来。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-5',
    step: {
      element: '#ml-training-steps',
      popover: {
        title: '第 6 步：训练完成',
        description: '模型训练完毕并已保存到本地。下次打开面板会自动加载，不需要重新训练。接下来看看训练结果。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-6',
    step: {
      element: '#ml-result-accuracy',
      popover: {
        title: '模型准确度',
        description:
          '圆环显示集成模型的 R² 准确度（0-100%），衡量模型能解释多少收益变化。下方是平均每次预测的偏差金额。',
        side: 'bottom',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-7',
    step: {
      element: '#ml-result-chart',
      popover: {
        title: '预测效果验证',
        description:
          '用模型没见过的数据来验证：蓝色柱子是实际收益，红色线是模型预测。两者越接近说明模型越准。上方标签显示影响收益最大的关键因素。',
        side: 'top',
        align: 'center',
      },
    },
  },
  {
    action: 'ml-demo-8',
    step: {
      element: '#ml-result-models',
      popover: {
        title: '三模型对比',
        description:
          '对比三个模型各自的准确度、偏差和权重分配。最终预测由三者加权合成，通常比任何单个模型都更稳定可靠。',
        side: 'top',
        align: 'center',
      },
    },
  },
];

export const EXTENDED_STEPS: TourStep[] = [
  ...ML_DEMO_STEPS,
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
  '1.0.1': [],
};
