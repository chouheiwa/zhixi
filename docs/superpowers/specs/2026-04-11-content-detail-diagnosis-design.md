# Content Detail Diagnosis Design

## Overview

Enhance the ContentDetailPage with deep single-article diagnosis capabilities. Two changes:

1. Add RPM daily trend chart to the existing "收益趋势" Tab
2. Add a new "内容诊断" Tab with four analysis modules: funnel analysis, engagement efficiency trends, income attribution, and peak/rhythm analysis

All analysis uses existing data (incomeRecords + contentDaily). No new API calls needed.

## Part 1: RPM Daily Trend (existing "收益趋势" Tab)

### Component: `RPMTrendChart`

**Location**: Inside the "收益趋势" Tab, after the daily income bar chart, before LifecycleAnalysis.

**Chart**:
- Line chart with two lines:
  - Solid line: daily RPM = `currentIncome / currentRead * 1000`
  - Dashed line: 7-day moving average RPM
- Horizontal dashed reference line at the overall average RPM
- When `currentRead === 0`, RPM = 0

**Data**: `incomeRecords` only.

## Part 2: Content Diagnosis Tab

New third Tab in ContentDetailPage labeled "内容诊断".

Contains four modules in order:

### 2a. Funnel Analysis — `ContentFunnelAnalysis`

**Three-layer funnel**:

| Layer | Formula | Meaning |
|-------|---------|---------|
| CTR (Click-Through Rate) | `sum(pv) / sum(show) * 100%` | Exposure → Read conversion; reflects title/cover appeal |
| Engagement Rate | `sum(upvote + comment + collect + share) / sum(pv) * 100%` | Read → Interaction conversion; reflects content quality |
| Monetization Rate (RPM) | `sum(income) / sum(pv) * 1000` | Read → Revenue efficiency |

**Display**:
- Top: 3 metric cards, each showing current value + comparison vs. user's global average (percentage difference, color-coded)
- Bottom: ECharts funnel chart (曝光 → 阅读 → 互动 → 收益)

**Benchmark**: Query DB for all content's aggregated data to compute global average CTR / engagement rate / RPM.

**Data requirements**: Both `dailyRecords` and `incomeRecords`. If `dailyRecords` empty, show "请先拉取每日数据" prompt.

### 2b. Engagement Efficiency Trends — `EngagementEfficiencyChart`

**Four rate lines** (all normalized by daily PV):

| Metric | Formula | Color |
|--------|---------|-------|
| 点赞率 | `upvote / pv * 100%` | warmRed |
| 评论率 | `comment / pv * 100%` | sage |
| 收藏率 | `collect / pv * 100%` | amberLight |
| 分享率 | `share / pv * 100%` | #8b7bb5 |

**Chart details**:
- Each line has a 7-day moving average (dashed overlay)
- Days with PV = 0 are skipped (gap in line)
- Tooltip shows both absolute value and rate: e.g., "点赞率 2.3%（23次/1000PV）"

**Trend summary label** (top-right corner):
- Compare last 7 days average vs. prior 7 days average for each rate
- Change > +20%: "↑ 上升", < -20%: "↓ 下降", otherwise: "→ 平稳"

**Data**: `dailyRecords` only.

### 2c. Income Attribution — `IncomeAttributionChart`

**Goal**: Identify which metric drives this article's daily income fluctuations.

**Method**: Multiple linear regression on the article's daily data.
- Target: `currentIncome`
- Features: `pv`, `upvote`, `comment`, `collect`, `share`
- Reuse existing `stats.ts` functions: `multipleLinearRegression`, `elasticityAnalysis`, `contributionPercentages`

**Display**:
1. Horizontal bar chart: each metric as a bar, length = standardized coefficient magnitude, using each metric's established color
2. Top: conclusion text, e.g., "收益最大驱动力：阅读量"
3. Below each bar: elasticity interpretation, e.g., "阅读量提升 10%，收益预计提升约 8.2%"
4. Bottom: R² value for model credibility

**Data joining**: Match `dailyRecords` and `incomeRecords` by date to get same-day metrics + income.

**Edge cases**:
- < 10 days of data: show "数据不足，至少需要 10 天"
- R² < 0.1: show "该内容的收益波动较随机，无法归因到单一指标"

### 2d. Peak and Rhythm Analysis — `PeakAndRhythmAnalysis`

Three sub-modules:

#### Peak Detection
- Find peak day for each key metric (pv, income, upvote, collect)
- Display as a compact card/table:

| Metric | Peak Date | Days After Publish | Peak Value |
|--------|-----------|-------------------|------------|
| 阅读量 | 03-15 | 第3天 | 2,340 |
| 收益 | 03-16 | 第4天 | ¥12.50 |

#### Weekend vs. Weekday Effect
- Split daily data into weekday / weekend groups
- Calculate average PV, average income, average engagement rate for each group
- Dual-bar comparison chart (3 metric pairs side by side)
- Bottom: conclusion text, e.g., "该内容周末阅读量高出工作日 35%"

#### Day-over-Day Growth Rate
- Calculate daily growth rate: `(today - yesterday) / yesterday * 100%`
- Dual-axis line chart: left axis = PV growth rate, right axis = income growth rate
- Zero line as dashed reference
- Positive area green, negative area red (area chart effect)
- Skip points where yesterday = 0

**Data**: `dailyRecords` + `incomeRecords`, requires `publishDate`.

**Minimum data**: 7 days, otherwise show "数据不足".

## File Structure

New files to create:
- `src/dashboard/components/RPMTrendChart.tsx`
- `src/dashboard/components/ContentFunnelAnalysis.tsx`
- `src/dashboard/components/EngagementEfficiencyChart.tsx`
- `src/dashboard/components/IncomeAttributionChart.tsx`
- `src/dashboard/components/PeakAndRhythmAnalysis.tsx`

Files to modify:
- `src/dashboard/components/ContentDetailPage.tsx` — add RPMTrendChart to income tab, add new "内容诊断" Tab with the four diagnosis components

Possibly extend:
- `src/shared/stats.ts` — add helper functions for moving average, growth rate, peak detection if not already present

## Demo Mode Support

All new components must accept a `demoMode` prop. When true, use the existing demo data generators (DEMO_INCOME_RECORDS / DEMO_DAILY_RECORDS) instead of querying DB. This ensures the onboarding tour can showcase these features.

## Design Constraints

- Follow existing component patterns (Card + ReactECharts)
- Reuse existing theme colors from `themeColors`
- Reuse existing `useCurrency()` for all monetary display
- No new API endpoints — all computation is client-side from existing DB data
- Components should gracefully handle insufficient data with clear messaging
