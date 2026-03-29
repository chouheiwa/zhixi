# ZhiXi Feature Expansion Design

## Overview

Add 10 new features to the ZhiXi Chrome extension, organized into 3 implementation batches. Each batch is independently deliverable and testable.

**Tech Stack:** React 18, TypeScript 5.7, Vite 5.4, Ant Design 6.3, ECharts 5.6, Dexie 4.0, TensorFlow.js 4.22, Chrome Extension MV3

**New Dependencies:**
- `xlsx` (SheetJS) — Excel export
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-and-drop panel customization

**Manifest Permission Changes:**
- Add `alarms` — scheduled auto-sync
- Add `notifications` — income anomaly alerts

---

## Data Layer Changes

### DB Schema v7

Two new stores added to Dexie database:

**`incomeGoals`** — User-set monthly income targets

| Field | Type | Description |
|-------|------|-------------|
| userId | string | PK (compound) |
| period | string | PK (compound), e.g. "2026-03" |
| targetAmount | number | Target in fen (cents) |
| createdAt | number | Timestamp |

Schema: `'[userId+period], userId'`

**`panelLayout`** — Dashboard layout customization

| Field | Type | Description |
|-------|------|-------------|
| userId | string | PK |
| tabs | TabConfig[] | Tab and panel configuration |

Schema: `'userId'`

### UserSettings Extension

Add fields to existing `userSettings` store (no schema change needed, just type extension):

```typescript
interface UserSettings {
  userId: string;
  collectStartDate: string;
  // New fields:
  autoSyncEnabled: boolean;       // default: true
  autoSyncIntervalHours: number;  // default: 6
  lastAutoSyncAt: number;         // timestamp, default: 0
}
```

---

## Batch 1: Basic Enhancements

### 1.1 Auto Sync (chrome.alarms)

**Files:**
- Modify: `src/manifest.ts` — add `alarms` permission
- Modify: `src/background/service-worker.ts` — alarm listener + smart skip logic
- Modify: `src/shared/types.ts` — extend UserSettings type
- Modify: `src/hooks/use-user-settings.ts` — expose new fields
- Modify: `src/dashboard/Dashboard.tsx` — add toggle in settings dropdown

**Logic:**
1. On extension install/startup: `chrome.alarms.create('autoSync', { periodInMinutes: 360 })`
2. On alarm fire:
   - Check `autoSyncEnabled` is true
   - Check user has `collectStartDate` set
   - Check if manual sync happened today: compare `lastAutoSyncAt` with today's date
   - If already synced today → skip
   - Otherwise → run `runSync()`, update `lastAutoSyncAt`
3. After sync completes → check for income anomaly (trigger 1.2)

**Settings UI:** Toggle switch in Dashboard settings dropdown: "自动同步（每6小时）"

### 1.2 Income Anomaly Alert (chrome.notifications)

**Files:**
- Modify: `src/manifest.ts` — add `notifications` permission
- Modify: `src/background/service-worker.ts` — anomaly check + notification

**Trigger:** After each auto-sync completion (NOT manual sync)

**Algorithm:**
1. Get yesterday's total income from DB
2. Get average daily income for the 7 days before yesterday
3. If yesterday < average * 0.5 → send notification

**Notification:**
```
Title: 知析 - 收益异常提醒
Body: 昨日收益 ¥X.XX，低于近7天均值 ¥Y.YY 的 50%
Icon: extension icon (128px)
```

Click notification → `chrome.tabs.create()` to open Dashboard.

### 1.3 Article vs Answer Comparison

**Files:**
- Create: `src/dashboard/components/ContentTypeComparisonPanel.tsx`
- Modify: `src/dashboard/Dashboard.tsx` — add to overview tab

**Props:** `{ records: IncomeRecord[], summaries: DailySummary[] }`

**Layout:**
- Top: Two summary cards side by side (Article | Answer)
  - Each card: count, total income, avg income per piece, avg RPM, avg reads
- Bottom: Grouped bar chart (ECharts)
  - X-axis: months
  - Two bar series: article monthly income, answer monthly income

**Data:** Group `records` by `contentType`, then aggregate by month using `recordDate`.

### 1.4 Best Publish Time Analysis

**Files:**
- Create: `src/dashboard/components/PublishTimeAnalysis.tsx`
- Modify: `src/dashboard/Dashboard.tsx` — add to overview tab

**Props:** `{ records: IncomeRecord[] }`

**Algorithm:**
1. Extract unique content items from records (by contentId)
2. For each content, get its `publishDate` → determine day-of-week (0=Sunday..6=Saturday)
3. For each content, sum income from records within 7 days of publishDate (first-week income)
4. Group by day-of-week, compute average first-week income and average first-week reads

**Layout:**
- Bar chart: X-axis Mon-Sun, Y-axis average first-week income
- Below chart: text recommendation: "建议在{最佳日}发布，平均首周收益最高（¥X.XX）"

### 1.5 Multi-Dimension Ranking

**Files:**
- Create: `src/dashboard/components/MultiDimensionRanking.tsx`
- Modify: `src/dashboard/Dashboard.tsx` — add to overview tab

**Props:** `{ records: IncomeRecord[] }`

**Layout:** `Segmented` control with 4 options, each showing a Top 10 list.

**Ranking dimensions:**

| Dimension | Metric | Filter |
|-----------|--------|--------|
| 收益最高 | Sum of `currentIncome` per contentId | None |
| RPM 最高 | (totalIncome / totalRead) * 1000 | totalRead >= 100 |
| 增长最快 | (recent 7d income - prior 7d income) / prior 7d income * 100. Recent 7d = last 7 days of data in selected range. Prior 7d = the 7 days before that. | prior 7d income > 0 |
| 互动率最高 | totalInteraction / totalRead | totalRead >= 100 |

**Each row:** Rank number, title (ellipsis), type tag (article/answer), metric value. Click → `onContentClick` to navigate to detail page.

---

## Batch 2: Core Features

### 2.1 Income Goal & Progress Tracking

**Files:**
- Create: `src/dashboard/components/IncomeGoalPanel.tsx`
- Create: `src/db/goal-store.ts` — CRUD for incomeGoals
- Modify: `src/db/database.ts` — add incomeGoals store in v7
- Modify: `src/dashboard/Dashboard.tsx` — add to overview tab (top position)

**Interaction:**
- No goal set → show "设定本月收益目标" button
- Click → Modal with InputNumber (unit: yuan)
- Save → `incomeGoals.put({ userId, period: "2026-03", targetAmount: value * 100, createdAt })`
- Goal set → show progress panel:
  - Progress bar with color coding: <50% blue, 50-80% orange, >80% green
  - Text: "本月已达成 ¥{current} / ¥{target}（{percent}%）"
  - Forecast: "按当前趋势，月底预计 ¥{projected}"
  - Projection formula: `projected = monthIncome + (monthIncome / daysElapsed) * daysRemaining`
- Edit/delete goal via icon button

### 2.2 Content Comparison Page

**Files:**
- Create: `src/dashboard/components/ContentComparePage.tsx`
- Modify: `src/dashboard/components/ContentTable.tsx` — add checkbox column + compare button
- Modify: `src/dashboard/components/ContentDetailPage.tsx` — add "添加到对比" button
- Modify: `src/dashboard/Dashboard.tsx` — routing logic for compare page

**Entry points:**
1. ContentTable: checkbox selection (2-3 items) → "对比" button appears above table → navigate to ContentComparePage with selected items
2. ContentComparePage: built-in search/select to add/remove content (max 3)
3. ContentDetailPage: "添加到对比" button → navigate to ContentComparePage with current item pre-selected

**Page layout:**
- Top bar: selected content as removable Tags + Select dropdown to add more (max 3)
- Chart section (4 ECharts, shared X-axis = dates):
  - Daily reads comparison (multi-line)
  - Daily income comparison (multi-line)
  - Cumulative income comparison (multi-line)
  - Engagement comparison (upvote + comment + collect, grouped)
- Summary table:
  - Rows: total income, total reads, RPM, avg daily income, lifecycle days, engagement rate
  - Columns: one per selected content

**Data source:** Query `contentDaily` store by each content's `contentToken`, and `incomeRecords` by `contentId`.

### 2.3 Excel Report Export

**Files:**
- Create: `src/dashboard/components/ExcelExportButton.tsx`
- Modify: `src/dashboard/Dashboard.tsx` — add to settings dropdown

**Dependencies:** `xlsx` (SheetJS)

**Excel structure (4 sheets):**

**Sheet 1 — 摘要 (Summary):**

| 指标 | 值 |
|------|-----|
| 数据范围 | {startDate} ~ {endDate} |
| 总收益 | ¥{totalIncome} |
| 总阅读量 | {totalRead} |
| 平均RPM | ¥{rpm} |
| 内容总数 | {count}篇 |
| 文章数 | {articleCount}篇 |
| 回答数 | {answerCount}篇 |
| 日均收益 | ¥{avgDailyIncome} |
| 采集天数 | {days}天 |

**Sheet 2 — 每日汇总 (Daily Summary):**

Columns: 日期, 收益(元), 阅读量, 互动量, 内容篇数, RPM

Data: One row per day from `allSummaries`.

**Sheet 3 — 内容明细 (Content Details):**

Columns: 标题, 类型, 发布日期, 总收益(元), 总阅读, 总互动, RPM, 点赞, 评论, 收藏

Data: Aggregated per unique contentId from `incomeRecords`.

**Sheet 4 — 按月汇总 (Monthly Summary):**

Columns: 月份, 收益(元), 阅读量, 内容篇数, RPM, 环比增长(%)

Data: Group `allSummaries` by month, compute totals and month-over-month growth.

**File name:** `知析报告-{userName}-{YYYY-MM-DD}.xlsx`

**Trigger:** Button in settings dropdown: "导出 Excel 报告"

### 2.4 Milestones & Achievements

**Files:**
- Create: `src/dashboard/components/MilestonesPage.tsx`
- Modify: `src/dashboard/Dashboard.tsx` — add entry in settings dropdown

**Entry:** Settings dropdown → "成就记录" → opens Modal

**Milestone definitions (hardcoded):**

| Category | Milestones |
|----------|-----------|
| 累计收益 | ¥10, ¥50, ¥100, ¥500, ¥1000, ¥5000, ¥10000 |
| 单日最高收益 | ¥1, ¥5, ¥10, ¥50 |
| 内容数量 | 10篇, 50篇, 100篇 |
| 连续收益天数 | 7天, 30天, 90天 |

**Computation:** All milestones computed in real-time from `allSummaries` + `allIncomeRecords`:
- Cumulative income: sum all `totalIncome`
- Single-day max: max of `totalIncome` per day
- Content count: count unique `contentId`
- Consecutive days: find longest streak where `totalIncome > 0`

**Display per milestone:**
- Achieved: green check icon + achieved date + metric value
- Not achieved: gray lock icon + progress hint ("还差 ¥200")

**Layout:** Grouped by category, each category as a Card with list items.

---

## Batch 3: Dashboard Panel Customization

### 3.1 Panel Registry

**File:** Create `src/dashboard/panel-registry.ts`

```typescript
interface PanelMeta {
  key: string;
  label: string;
  tab: string;
  component: React.ComponentType<any>;
  defaultOrder: number;
  defaultVisible: boolean;
  propsMapper: (context: DashboardContext) => Record<string, any>;
}
```

**DashboardContext:** A typed object containing all data that panels might need:
```typescript
interface DashboardContext {
  allSummaries: DailySummary[];
  records: IncomeRecord[];
  allIncomeRecords: { contentId: string; recordDate: string }[];
  allDateRange: { start: string; end: string };
  monetizedContentIds: Set<string>;
  userId: string;
  onContentClick: (item: ContentTableItem) => void;
  // ... other shared state
}
```

Each panel registered with a `propsMapper` function that extracts the props it needs from the context. This decouples panels from Dashboard's internal state.

**Registry entries (all panels):**

| Tab | Panel Key | Label | Default Visible |
|-----|-----------|-------|----------------|
| overview | incomeGoal | 收益目标 | true |
| overview | dailyTrend | 日趋势图 | true |
| overview | contentTypeComparison | 文章vs回答 | true |
| overview | rpm | RPM分析 | true |
| overview | weeklySeasonality | 周期性分析 | true |
| overview | publishTimeAnalysis | 发布时间分析 | true |
| overview | multiDimensionRanking | 多维度排行 | true |
| overview | anomalyDetection | 异常检测 | true |
| ml | mlPrediction | 智能分析 | true |
| unmonetized | unmonetizedContent | 未产生收益 | true |
| content | contentTable | 内容明细 | true |

### 3.2 Layout Customizer UI

**File:** Create `src/dashboard/components/LayoutCustomizer.tsx`

**Entry:** Settings dropdown → "自定义布局"

**UI:** Ant Design `Drawer` (side panel, 360px width)

**Structure:**
- Section 1: Tab list
  - Each tab row: drag handle + label + Switch (visible toggle)
  - Drag to reorder tabs using `@dnd-kit/sortable`
- Section 2: On clicking a tab → expand panel list below
  - Each panel row: drag handle + label + Switch
  - Drag to reorder panels within the tab
- Footer: "恢复默认" button → reset to registry defaults

**Persistence:** Save to `panelLayout` store on every change (debounced 500ms).

### 3.3 Dashboard Rendering Refactor

**Modify:** `src/dashboard/Dashboard.tsx`

**New hook:** `usePanelLayout(userId: string)` in `src/hooks/use-panel-layout.ts`
- Reads `panelLayout` from DB
- If none exists, generates default from panel registry
- Returns `{ layout, updateLayout, resetLayout }`

**Rendering change:**
```
Current: hardcoded <Tabs items={[{key:'overview', children: <A/><B/><C/>}, ...]} />
New:     layout.tabs
           .filter(t => t.visible)
           .sort((a,b) => a.order - b.order)
           .map(tab => ({
             key: tab.key,
             label: tab.label,
             children: tab.panels
               .filter(p => p.visible)
               .sort((a,b) => a.order - b.order)
               .map(p => registry.get(p.key).render(context))
           }))
```

This means all panel-specific JSX moves out of Dashboard.tsx into the registry.

### 3.4 Migration Strategy

To avoid breaking existing functionality during Batch 3:
1. Batch 1 & 2 panels are added with traditional hardcoded approach first
2. Batch 3 refactors everything to be registry-driven
3. Each panel's props are mapped through `propsMapper`, so the component code itself doesn't change
4. If a user has no saved layout, the default from registry is used (backward compatible)

---

## New Files Summary

| File | Batch | Purpose |
|------|-------|---------|
| `src/dashboard/components/ContentTypeComparisonPanel.tsx` | 1 | Article vs Answer comparison |
| `src/dashboard/components/PublishTimeAnalysis.tsx` | 1 | Best publish time analysis |
| `src/dashboard/components/MultiDimensionRanking.tsx` | 1 | Multi-dimension content ranking |
| `src/dashboard/components/IncomeGoalPanel.tsx` | 2 | Income goal & progress tracking |
| `src/dashboard/components/ContentComparePage.tsx` | 2 | Side-by-side content comparison |
| `src/dashboard/components/ExcelExportButton.tsx` | 2 | Excel report generation |
| `src/dashboard/components/MilestonesPage.tsx` | 2 | Achievements & milestones |
| `src/db/goal-store.ts` | 2 | CRUD for incomeGoals |
| `src/dashboard/panel-registry.ts` | 3 | Panel metadata registry |
| `src/dashboard/components/LayoutCustomizer.tsx` | 3 | Drag-and-drop layout config |
| `src/hooks/use-panel-layout.ts` | 3 | Layout persistence hook |

## Modified Files Summary

| File | Batches | Changes |
|------|---------|---------|
| `src/manifest.ts` | 1 | Add `alarms`, `notifications` permissions |
| `src/background/service-worker.ts` | 1 | Alarm handler, anomaly check, notification |
| `src/shared/types.ts` | 1, 2 | Extend UserSettings, add PanelLayout types |
| `src/db/database.ts` | 2, 3 | v7: add incomeGoals, panelLayout stores |
| `src/dashboard/Dashboard.tsx` | 1, 2, 3 | Add panels, dropdown entries, registry rendering |
| `src/dashboard/components/ContentTable.tsx` | 2 | Add checkbox column, compare button |
| `src/dashboard/components/ContentDetailPage.tsx` | 2 | Add "添加到对比" button |
| `src/hooks/use-user-settings.ts` | 1 | Expose autoSync fields |

## Implementation Order

1. **Batch 1** (5 features): Auto-sync, Anomaly alert, Article vs Answer, Publish time, Rankings
2. **Batch 2** (4 features): Income goals, Content compare, Excel export, Milestones
3. **Batch 3** (1 feature): Dashboard panel customization (refactors all panels to registry-driven)
