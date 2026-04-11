# 全局引导 Tour 重设计

## 背景

当前 onboarding tour 仅覆盖总览(overview) tab 的面板。Dashboard 共有 4 个 tab：总览、智能分析、未产生收益、内容明细，后三个 tab 完全没有引导。此外，首次进入的触发流程存在竞态条件（tour 启动时 DOM 未就绪）。

## 目标

1. tour 覆盖所有 4 个 tab，一次性连贯引导
2. 保留 CORE/EXTENDED 两段式，但调整分界：CORE 做全局概览（每个 tab 1-2 步），EXTENDED 深入高级功能
3. 修复首次进入流程：先弹设置模态框 → 确认后启动 tour + 后台同步

## 实现方案：step 级 `onHighlightStarted` 回调切 tab

### 1. Tabs 受控化

Dashboard.tsx 的 `<Tabs>` 从非受控改为受控模式：

- 新增 `activeTabKey` state，默认 `'overview'`
- `<Tabs activeKey={activeTabKey} onChange={setActiveTabKey} ...>`
- 将 `setActiveTabKey` 作为 `switchTab` 回调传入 tour 管理

### 2. Step 配置扩展

新增 `TourStep` 类型，在 `DriveStep` 基础上增加 `tab` 字段：

```typescript
interface TourStep {
  tab?: string; // 'overview' | 'ml' | 'unmonetized' | 'content'
  step: DriveStep;
}
```

不声明 `tab` 的 step 不触发 tab 切换。

### 3. tour-manager 改造

`startCoreTour` 和 `startExtendedTour` 接收 `switchTab: (tabKey: string) => void` 回调。

构建 driver steps 时，对每个带 `tab` 字段的 TourStep，注入 `onHighlightStarted` 回调调用 `switchTab(step.tab)`。

tour 结束后（`onDestroyed`）自动切回 `overview` tab。

注意：`onHighlightStarted` 回调中调用 `switchTab` 后，driver.js 会立即查找目标 DOM 元素。由于 React 18 的 `setState` 默认是批量异步的，需要使用 `flushSync` 包裹 `switchTab` 调用，确保 DOM 在回调返回前同步更新。

### 4. 内容明细 tab 的 tour 锚点

内容明细 tab 不走 panel-registry，需要在 Dashboard.tsx 的 content tab 渲染处添加：

- `#tour-content-table`：包裹表格区域
- `#tour-content-actions`：包裹操作区域（日期选择器、对比按钮等）

### 5. Demo 数据扩展

`demo-data.ts` 补充：

- pin（想法）类型的 demo IncomeRecord，使内容类型对比面板能展示三种类型
- ML 面板和未产生收益面板在 tour 激活时需要有可展示的 demo 状态（空状态下展示功能说明即可，不需要 mock 训练结果）

### 6. CORE/EXTENDED 确认框文案

CORE 走完后确认框：
- 标题："基础功能介绍完毕"
- 内容："要继续了解高级分析功能吗？也可以稍后在设置菜单中重新查看。"

## 步骤分配

### CORE（9 步，全局概览）

| # | tab | element | 标题 | 说明要点 |
|---|-----|---------|------|---------|
| 1 | - | #tour-settings-menu | 设置菜单 | 控制中心：同步/导出/布局/成就 |
| 2 | - | #tour-summary-cards | 收益概览 | 昨日/本月/累计核心数据 |
| 3 | overview | #tour-incomeGoal | 收益目标 | 设定月度目标，查看进度 |
| 4 | overview | #tour-dailyTrend | 每日趋势 | 阅读量/互动量/收益日变化 |
| 5 | - | #tour-tab-bar | 更多分析维度 | 4 个 tab 各有侧重 |
| 6 | ml | #tour-mlPrediction | 智能分析 | ML 预测收益趋势 |
| 7 | unmonetized | #tour-unmonetizedContent | 未产生收益 | 找出未变现内容 |
| 8 | content | #tour-content-table | 内容明细 | 逐篇查看收益数据，支持排序筛选 |
| 9 | content | #tour-content-actions | 操作功能 | 对比分析、批量拉取详情 |

### EXTENDED（7 步，深入高级功能）

| # | tab | element | 标题 | 说明要点 |
|---|-----|---------|------|---------|
| 1 | overview | #tour-contentTypeComparison | 文章 vs 回答 | 对比不同内容形式的变现效率 |
| 2 | overview | #tour-rpm | RPM 分析 | 每千次阅读收益及趋势 |
| 3 | overview | #tour-weeklySeasonality | 周期性分析 | 一周中哪几天表现最好 |
| 4 | overview | #tour-publishTimeAnalysis | 最佳发布时间 | 找到最佳发布时机 |
| 5 | overview | #tour-multiDimensionRanking | 多维度排行 | 四个维度找明星内容 |
| 6 | overview | #tour-anomalyDetection | 异常检测 | 识别收益/阅读异常波动 |
| 7 | overview | #tour-settings-menu | 更多功能 | 导出报告、成就记录、自定义布局、重新查看引导 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/dashboard/tour/tour-config.ts` | 重写 CORE_STEPS/EXTENDED_STEPS，使用 TourStep 类型，增加 tab 字段和新 step |
| `src/dashboard/tour/tour-manager.ts` | startCoreTour/startExtendedTour 接收 switchTab 回调，注入 onHighlightStarted |
| `src/dashboard/hooks/useTourManagement.ts` | 传递 switchTab，tour 结束切回 overview |
| `src/dashboard/Dashboard.tsx` | Tabs 受控化，content tab 加 tour 锚点 id |
| `src/dashboard/tour/demo-data.ts` | 补充 pin 类型 demo 数据 |

## 不在范围内

- "想法"(pin) 功能本身的新增：经确认代码已完整支持，数据取决于知乎 API 返回
- tour 主题样式调整
- 新功能 banner 机制变更
