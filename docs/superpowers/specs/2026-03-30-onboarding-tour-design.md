# 知析 新手引导功能设计

## 概述

为知析 Dashboard 添加交互式新手引导功能，帮助用户快速了解各功能区域。采用 driver.js 步进式高亮引导，首次使用时自动触发，版本更新时提示新功能。

## 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 触发时机 | 首次使用 + 新功能提示 | 兼顾新用户上手和老用户发现新功能 |
| 交互形式 | 步进式高亮引导 (driver.js) | 直观，与真实界面结合，用户可看到实际位置 |
| 步骤分层 | 核心 5 步 + 可选扩展 4 步 | 避免用户疲劳，同时提供完整探索路径 |
| 新功能提示 | 顶部通知条 + 步进引导 | 不打扰 + 可深入了解 |
| 状态存储 | Dexie 数据库 | 与现有数据管理一致 |

## 技术选型

**driver.js** (v1.x)
- 轻量：~6KB gzipped
- 零依赖
- 支持 CSS selector 定位元素
- 支持自定义 popover 样式
- 支持步骤回调（onNext, onPrevious, onComplete）
- MIT 协议

## 数据模型

### TourState（新增 Dexie store）

```typescript
interface TourState {
  userId: string;            // 主键
  completedVersion: string;  // 已完成引导的最新版本号，如 "1.0.0"
  seenFeatures: string[];    // 已读的新功能 key 列表
  coreCompleted: boolean;    // 核心引导（5步）是否完成
  extendedCompleted: boolean; // 扩展引导（4步）是否完成
}
```

数据库升级：v9，新增 `tourState` store，主键为 `userId`。

## 文件结构

```
src/dashboard/tour/
├── tour-config.ts       # 引导步骤定义 + 版本变更日志
├── tour-manager.ts      # 引导控制逻辑（启动、版本检测）
├── NewFeatureBanner.tsx  # 顶部新功能通知条组件
└── tour-theme.css       # driver.js 自定义样式（匹配编辑器主题）
src/db/tour-store.ts     # TourState 的 Dexie CRUD
```

修改文件：
- `src/db/database.ts` — v9 升级，新增 tourState store
- `src/dashboard/Dashboard.tsx` — 集成引导入口、添加元素 id、渲染 NewFeatureBanner

## 引导步骤定义

### 核心引导（5步，首次使用自动触发）

| 步骤 | 目标选择器 | 标题 | 说明 |
|------|-----------|------|------|
| 1 | `#tour-sync-button` | 同步数据 | 点击这里从知乎同步最新的收益数据 |
| 2 | `#tour-summary-cards` | 收益概览 | 这里展示昨日、本月和累计收益数据 |
| 3 | `#tour-daily-trend` | 每日趋势 | 查看阅读量和收益的每日变化趋势 |
| 4 | `#tour-tab-bar` | 分析维度 | 切换不同 Tab 查看智能分析、内容明细等 |
| 5 | `#tour-layout-button` | 自定义面板 | 可以按需显示、隐藏和排列各分析面板 |

核心引导完成后弹出确认：
- 标题："还有更多功能可以探索"
- 按钮："继续探索" / "稍后再看"
- "继续探索"→ 启动扩展引导
- "稍后再看"→ 记录 coreCompleted=true，在设置菜单中保留"功能介绍"入口

### 扩展引导（4步，可选）

| 步骤 | 目标选择器 | 标题 | 说明 |
|------|-----------|------|------|
| 6 | `#tour-income-goal` | 收益目标 | 设定月度收益目标，追踪完成进度 |
| 7 | `#tour-rpm-panel` | RPM 趋势 | 追踪每千次阅读收益效率，评估内容变现能力 |
| 8 | `#tour-milestones` | 成就记录 | 查看你的收益里程碑和最高记录 |
| 9 | `#tour-export` | 数据导出 | 导出收益数据报告为 Excel 文件 |

### 版本变更日志

```typescript
const FEATURE_CHANGELOG: Record<string, FeatureEntry[]> = {
  "1.0.0": [], // 初始版本，无新功能提示（走首次引导）
  // 未来版本示例：
  // "1.1.0": [
  //   { key: "newPanel", selector: "#tour-new-panel", title: "新面板", description: "..." }
  // ],
};
```

每个版本条目包含该版本新增的功能及其引导步骤。Dashboard 加载时比较用户的 `completedVersion` 与当前 `TOUR_VERSION`，筛选出未读功能。

## 引导流程

### 首次使用

```
Dashboard 加载
  → 查询 tourState（userId）
  → 无记录
  → 等待首次同步完成（collectStartDate 已设置 && 有数据）
  → 自动启动核心引导（5步）
  → 核心引导完成
  → 弹出"还有更多功能"提示
  → 用户选择"继续"→ 扩展引导（4步）→ 记录 coreCompleted + extendedCompleted
  → 用户选择"稍后"→ 记录 coreCompleted
```

### 版本更新

```
Dashboard 加载
  → 查询 tourState（userId）
  → 有记录，比较 completedVersion < TOUR_VERSION
  → 有新功能
  → 顶部显示 NewFeatureBanner："本次更新新增了 N 个功能"
  → 用户点击"查看新功能"
  → 启动新功能步进引导（仅新功能步骤）
  → 完成/关闭 → 更新 seenFeatures + completedVersion
```

### 手动触发

设置菜单中添加"功能介绍"入口，点击后可选择：
- 重新开始完整引导（核心 + 扩展）
- 仅查看未读新功能（如有）

## NewFeatureBanner 组件

位于 Dashboard 顶部（进度条下方、统计卡片上方）：

```
┌─────────────────────────────────────────────────────┐
│ 🆕 本次更新新增了 2 个新功能    [查看新功能] [忽略] │
└─────────────────────────────────────────────────────┘
```

- 背景色：`themeColors.amberBg`（与主题一致）
- 左侧图标 + 文字，右侧两个按钮
- "忽略"→ 隐藏横幅 + 标记已读
- "查看新功能"→ 隐藏横幅 + 启动步进引导

## driver.js 主题定制

自定义 driver.js popover 样式以匹配知析编辑器主题：

```css
.driver-popover {
  font-family: "Source Han Sans SC", -apple-system, "PingFang SC", sans-serif;
  background: #fff;
  border: 1px solid #e0dcd6;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.driver-popover-title {
  font-family: "Noto Serif SC", serif;
  color: #333;
  font-weight: 600;
}

.driver-popover-description {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.driver-popover-progress-text {
  color: #999;
  font-size: 11px;
}

.driver-popover-navigation-btns .driver-popover-next-btn {
  background: #5b7a9d;
  color: #fff;
  border-radius: 6px;
}

.driver-popover-navigation-btns .driver-popover-prev-btn {
  color: #5b7a9d;
}

.driver-overlay {
  background: rgba(0, 0, 0, 0.35);
}
```

## Dashboard 元素 ID 添加

在 Dashboard.tsx 中为引导目标元素添加 id 属性：

| 元素 | 添加的 id |
|------|----------|
| 同步/采集按钮 | `tour-sync-button` |
| 统计卡片 Row | `tour-summary-cards` |
| 第一个趋势面板容器 | `tour-daily-trend` |
| Tabs 组件 | `tour-tab-bar` |
| 面板自定义按钮 | `tour-layout-button` |
| 收益目标面板容器 | `tour-income-goal` |
| RPM 面板容器 | `tour-rpm-panel` |
| 里程碑入口按钮 | `tour-milestones` |
| 导出按钮 | `tour-export` |

面板容器的 id 由 panel-registry 渲染时自动添加：`id={`tour-${panel.key}`}`。

## tour-manager.ts API

```typescript
// 当前引导版本
export const TOUR_VERSION = "1.0.0";

// 判断应该展示什么引导
export function shouldShowTour(
  tourState: TourState | undefined
): "core" | "extended" | "new-features" | null;

// 获取新功能列表
export function getNewFeatures(
  tourState: TourState
): FeatureEntry[];

// 启动引导
export function startCoreTour(onComplete: () => void): void;
export function startExtendedTour(onComplete: () => void): void;
export function startNewFeatureTour(
  features: FeatureEntry[],
  onComplete: () => void
): void;
```

## tour-store.ts API

```typescript
export async function getTourState(userId: string): Promise<TourState | undefined>;
export async function saveTourState(state: TourState): Promise<void>;
export async function markCoreCompleted(userId: string): Promise<void>;
export async function markExtendedCompleted(userId: string): Promise<void>;
export async function markFeaturesRead(userId: string, featureKeys: string[]): Promise<void>;
export async function updateCompletedVersion(userId: string, version: string): Promise<void>;
export async function resetTourState(userId: string): Promise<void>;
```

## 设置菜单入口

在 Dashboard 右上角下拉菜单中添加"功能介绍"项：

```
┌──────────────┐
│ 📥 导入数据   │
│ 📤 导出数据   │
│ 📊 导出报告   │
│ ─────────── │
│ 📖 功能介绍   │  ← 新增
│ ⚙️ 面板设置   │
└──────────────┘
```

点击后：
- 如果有未读新功能 → 提示"查看新功能？"，确认后启动新功能引导
- 否则 → 重新启动完整引导（重置 coreCompleted/extendedCompleted 为 false）

## 边界情况

1. **数据未加载完成时**：引导需等待 Dashboard 数据加载完毕（summaries 非空）再启动，避免面板未渲染导致定位失败
2. **面板被隐藏时**：如果用户自定义面板布局隐藏了某些面板，引导步骤中跳过不可见的面板（`driver.js` 会自动跳过不存在的元素）
3. **窗口大小变化**：driver.js 内置窗口 resize 监听，自动重新定位
4. **用户中途关闭引导**：保存已完成的步骤数（通过 onDestroyed 回调），下次不会重复展示已完成的引导层级
5. **多用户切换**：tourState 以 userId 为主键，不同用户独立记录
