# ML 智能分析引导功能设计

## 背景

当前 tour 系统中 ML 面板只有一个高亮步骤，demo 模式下的训练动画通过 setTimeout 自动播放，与 tour 步骤之间没有同步机制，导致引导体验不完整。

## 目标

为 ML 智能分析面板实现完整的 9 步引导，由 tour 驱动面板状态切换，训练阶段分步引导（用户点"下一步"推进），结果阶段依次介绍各区域。

## 设计

### 位置

- CORE_STEPS 中保留 1 步简介（替换现有 ML 步骤）
- EXTENDED_STEPS 最前面插入 9 步详细引导，之后接原有 7 步 overview 高级面板

### 状态模型

ML 面板通过 `demoStep` prop 控制显示状态：

| demoStep | 面板显示 | tour 步骤 |
|----------|---------|----------|
| undefined | 正常模式 | — |
| 0 | 准备数据界面，dataCount=156 | 训练 1/6 |
| 1 | Steps 显示随机森林进行中，进度 33% | 训练 2/6 |
| 2 | Steps 显示岭回归进行中，进度 50% | 训练 3/6 |
| 3 | Steps 显示神经网络进行中，loss 曲线自动播放 | 训练 4/6 |
| 4 | Steps 显示集成计算进行中，进度 83% | 训练 5/6 |
| 5 | Steps 全部完成 | 训练 6/6 |
| 6 | 结果页：高亮准确度圆环 | 结果 1/3 |
| 7 | 结果页：高亮预测效果图 | 结果 2/3 |
| 8 | 结果页：高亮三模型对比 | 结果 3/3 |

### 数据流

```
tour action (ml-demo-N) → Dashboard.onAction → setMlDemoStep(N)
  → DashboardContext.mlDemoStep → panel-registry → MLPredictionPanel(demoStep=N)
```

### 神经网络动画锁定

- demoStep=3 时面板播放 loss 曲线动画（约 2.5 秒）
- 播放期间通过 `onDemoAnimating(true)` 通知 Dashboard
- Dashboard 通过 DOM 操作禁用 driver.js 的"下一步"按钮
- 动画完成后 `onDemoAnimating(false)`，恢复按钮

### Tour 步骤配置

CORE_STEPS 中 ML 步骤（1 步简介）：

```typescript
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
}
```

EXTENDED_STEPS 中 ML 步骤（9 步，插在最前面）：

| # | action | element | title | description |
|---|--------|---------|-------|-------------|
| 1 | ml-demo-0 | #tour-mlPrediction | 准备数据 | 训练前需要准备特征数据，每条数据包含阅读量、点赞等 19 个特征 |
| 2 | ml-demo-1 | #ml-training-steps | 随机森林 | 200 棵决策树投票取平均，擅长捕捉阈值效应 |
| 3 | ml-demo-2 | #ml-training-steps | 岭回归 | 线性模型，擅长捕捉线性趋势 |
| 4 | ml-demo-3 | #ml-training-neural | 神经网络 | 128→64→32→16→1 四层网络，loss 曲线展示训练过程（请等待动画完成） |
| 5 | ml-demo-4 | #ml-training-steps | 集成计算 | 按各模型准确度自动分配权重 |
| 6 | ml-demo-5 | #ml-training-steps | 训练完成 | 三个模型训练完毕，准备展示结果 |
| 7 | ml-demo-6 | #ml-result-accuracy | 模型准确度 | 圆环显示集成模型的 R² 准确度和平均偏差 |
| 8 | ml-demo-7 | #ml-result-chart | 预测效果验证 | 蓝色柱子是实际收益，红色线是模型预测，越接近说明越准 |
| 9 | ml-demo-8 | #ml-result-models | 模型对比 | 三个模型各有所长，最终预测由加权合成 |

### 组件改动

#### MLPredictionPanel

- 新增 Props：`demoStep?: number`、`onDemoAnimating?: (animating: boolean) => void`
- 移除现有 setTimeout 自动播放的 useEffect
- 根据 demoStep 渲染对应状态：0 准备界面，1-5 训练进度，6-8 结果展示
- demoStep=3 时用 setInterval 逐帧更新 loss 数据，完成后调 onDemoAnimating(false)
- demo 数据（demoFinalResult、demoPredictions）提取为模块级常量

#### Dashboard

- 新增 `mlDemoStep` 和 `mlAnimating` 状态
- tourCallbacks.onAction 扩展：匹配 `ml-demo-N` 设置 mlDemoStep，`ml-demo-reset` 重置
- mlDemoStep 和 setMlAnimating 加入 DashboardContext

#### panel-registry

- DashboardContext 新增 `mlDemoStep?: number`、`onMlDemoAnimating?: (v: boolean) => void`
- MLPredictionPanel 渲染时传入新 props

#### tour-manager

- startExtendedTour 的 onDestroyed 中调用 `callbacks.onAction?.('ml-demo-reset')`

#### tour-config

- CORE_STEPS：替换 ML 步骤为简介版
- EXTENDED_STEPS：前 9 步为 ML 引导，后 7 步保持原有 overview 高级面板

### 清理

EXTENDED tour 结束时（onDestroyed），发送 `ml-demo-reset` action 将面板恢复正常状态。
