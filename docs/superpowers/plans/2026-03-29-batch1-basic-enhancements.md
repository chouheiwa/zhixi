# Batch 1: Basic Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 features: auto-sync via chrome.alarms, income anomaly notifications, article vs answer comparison panel, best publish time analysis, and multi-dimension ranking.

**Architecture:** Extend manifest permissions (alarms, notifications), add alarm handler + anomaly check to service worker, create 3 new dashboard panels in the overview tab. All panels are pure components receiving data via props from Dashboard.tsx.

**Tech Stack:** React 18, TypeScript, Ant Design 6.3, ECharts 5.6, Chrome Extension MV3 (alarms + notifications APIs)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/manifest.ts` | Modify | Add `alarms`, `notifications` permissions |
| `src/shared/types.ts` | Modify | Extend `UserSettings` with autoSync fields |
| `src/shared/constants.ts` | Modify | Add `STORAGE_KEYS.LAST_AUTO_SYNC_DATE` |
| `src/db/income-store.ts` | Modify | Add `saveUserSettings` support for new fields |
| `src/background/service-worker.ts` | Modify | Add alarm setup, handler, anomaly check, notification |
| `src/dashboard/components/ContentTypeComparisonPanel.tsx` | Create | Article vs Answer comparison |
| `src/dashboard/components/PublishTimeAnalysis.tsx` | Create | Best publish time analysis |
| `src/dashboard/components/MultiDimensionRanking.tsx` | Create | Multi-dimension content ranking |
| `src/dashboard/Dashboard.tsx` | Modify | Add 3 new panels to overview tab, add auto-sync toggle |

---

### Task 1: Manifest Permissions & UserSettings Type Extension

**Files:**
- Modify: `src/manifest.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add alarms and notifications permissions to manifest**

In `src/manifest.ts`, change:
```typescript
permissions: ["storage", "tabs"],
```
to:
```typescript
permissions: ["storage", "tabs", "alarms", "notifications"],
```

- [ ] **Step 2: Extend UserSettings type**

In `src/shared/types.ts`, change:
```typescript
export interface UserSettings {
  userId: string;
  /** The start date from which to collect data (user-chosen) */
  collectStartDate: string;
}
```
to:
```typescript
export interface UserSettings {
  userId: string;
  /** The start date from which to collect data (user-chosen) */
  collectStartDate: string;
  /** Whether auto-sync is enabled (default: true) */
  autoSyncEnabled?: boolean;
  /** Auto-sync interval in hours (default: 6) */
  autoSyncIntervalHours?: number;
  /** Timestamp of last auto-sync */
  lastAutoSyncAt?: number;
}
```

- [ ] **Step 3: Add LAST_AUTO_SYNC_DATE constant**

In `src/shared/constants.ts`, change:
```typescript
export const STORAGE_KEYS = {
  LAST_COLLECT_DATE: 'lastCollectDate',
} as const;
```
to:
```typescript
export const STORAGE_KEYS = {
  LAST_COLLECT_DATE: 'lastCollectDate',
  LAST_AUTO_SYNC_DATE: 'lastAutoSyncDate',
} as const;

export const AUTO_SYNC_INTERVAL_MINUTES = 360; // 6 hours
```

- [ ] **Step 4: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/manifest.ts src/shared/types.ts src/shared/constants.ts
git commit -m "feat: add alarms/notifications permissions and extend UserSettings type"
```

---

### Task 2: Auto-Sync with chrome.alarms

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Add alarm setup and handler to service worker**

At the top of `src/background/service-worker.ts`, after the existing imports, add:
```typescript
import { AUTO_SYNC_INTERVAL_MINUTES, STORAGE_KEYS } from '@/shared/constants';
```

(Note: `STORAGE_KEYS` is already imported, so just add `AUTO_SYNC_INTERVAL_MINUTES` to the existing import.)

Change:
```typescript
import { STORAGE_KEYS, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX } from '@/shared/constants';
```
to:
```typescript
import { STORAGE_KEYS, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX, AUTO_SYNC_INTERVAL_MINUTES } from '@/shared/constants';
```

- [ ] **Step 2: Add alarm initialization at the bottom of the file**

At the very end of `src/background/service-worker.ts`, after the `chrome.tabs.onUpdated.addListener` block, add:

```typescript
// ============ Auto-Sync Alarm ============

function setupAutoSyncAlarm() {
  chrome.alarms.create('autoSync', { periodInMinutes: AUTO_SYNC_INTERVAL_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  setupAutoSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupAutoSyncAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoSync') return;

  try {
    // Check if user has set up
    const user = await fetchCurrentUser();
    const settings = await getUserSettings(user.id);
    if (!settings?.collectStartDate) return;

    // Check if auto-sync is disabled
    if (settings.autoSyncEnabled === false) return;

    // Check if already synced today (manual or auto)
    const today = formatDate(new Date());
    const lastAutoSync = settings.lastAutoSyncAt;
    if (lastAutoSync) {
      const lastSyncDate = formatDate(new Date(lastAutoSync));
      if (lastSyncDate === today) return;
    }

    // Also check the tab-based auto-sync flag
    const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
    if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === today) return;

    // Run sync
    addLog('自动定时同步开始...');
    await runSync();

    // Update lastAutoSyncAt
    await saveUserSettings({ ...settings, lastAutoSyncAt: Date.now() });

    // Check for anomaly and notify
    await checkIncomeAnomalyAndNotify(user.id);
  } catch {
    // Silent fail for auto-sync
  }
});
```

- [ ] **Step 3: Add the anomaly check and notification function**

Above the alarm setup section, add:

```typescript
// ============ Income Anomaly Notification ============

async function checkIncomeAnomalyAndNotify(userId: string): Promise<void> {
  try {
    const allSummaries = await getAllDailySummaries(userId);
    if (allSummaries.length < 8) return; // Need at least 8 days of data

    // Get yesterday's income
    const yesterday = getYesterday();
    const yesterdaySummary = allSummaries.find(s => s.date === yesterday);
    if (!yesterdaySummary) return;

    const yesterdayIncome = yesterdaySummary.totalIncome / 100;

    // Get average of 7 days before yesterday
    const yesterdayIdx = allSummaries.findIndex(s => s.date === yesterday);
    if (yesterdayIdx < 7) return;

    const prev7 = allSummaries.slice(yesterdayIdx - 7, yesterdayIdx);
    const avg7 = prev7.reduce((sum, s) => sum + s.totalIncome, 0) / 100 / prev7.length;

    if (avg7 <= 0) return;

    // Check if yesterday < 50% of average
    if (yesterdayIncome < avg7 * 0.5) {
      chrome.notifications.create('income-anomaly', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '知析 - 收益异常提醒',
        message: `昨日收益 ¥${yesterdayIncome.toFixed(2)}，低于近7天均值 ¥${avg7.toFixed(2)} 的 50%`,
        priority: 2,
      });
    }
  } catch {
    // Silent fail
  }
}

// Open dashboard when notification clicked
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'income-anomaly') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
    chrome.notifications.clear(notificationId);
  }
});
```

- [ ] **Step 4: Add the missing import for getAllDailySummaries**

Change the import from `@/db/income-store`:
```typescript
import { upsertIncomeRecords, getMissingDates, getUserSettings, saveUserSettings, markDateSynced } from '@/db/income-store';
```
to:
```typescript
import { upsertIncomeRecords, getMissingDates, getUserSettings, saveUserSettings, markDateSynced, getAllDailySummaries } from '@/db/income-store';
```

- [ ] **Step 5: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: add auto-sync alarm and income anomaly notification"
```

---

### Task 3: Auto-Sync Toggle in Dashboard

**Files:**
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add auto-sync toggle to settings dropdown**

In `src/dashboard/Dashboard.tsx`, find the settings dropdown `items` array. After the `info` item, add a new menu item.

Find:
```typescript
                  {
                    key: 'info', label: (
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {hasSetup ? `采集范围：${settings!.collectStartDate} 起` : '未设置采集'}
                      </span>
                    ), disabled: true,
                  },
```

Before this item, add:
```typescript
                  { type: 'divider' },
                  {
                    key: 'autoSync',
                    label: (
                      <Flex justify="space-between" align="center" style={{ minWidth: 160 }}>
                        <span>自动同步（每6小时）</span>
                        <span style={{ color: settings?.autoSyncEnabled !== false ? '#52c41a' : '#999', fontSize: 12 }}>
                          {settings?.autoSyncEnabled !== false ? '已开启' : '已关闭'}
                        </span>
                      </Flex>
                    ),
                    onClick: async () => {
                      if (!user || !settings) return;
                      const newEnabled = settings.autoSyncEnabled === false;
                      await import('@/db/income-store').then(m =>
                        m.saveUserSettings({ ...settings, autoSyncEnabled: newEnabled })
                      );
                      refreshSettings();
                    },
                  },
```

- [ ] **Step 2: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/Dashboard.tsx
git commit -m "feat: add auto-sync toggle in dashboard settings"
```

---

### Task 4: Article vs Answer Comparison Panel

**Files:**
- Create: `src/dashboard/components/ContentTypeComparisonPanel.tsx`

- [ ] **Step 1: Create the ContentTypeComparisonPanel component**

Create `src/dashboard/components/ContentTypeComparisonPanel.tsx`:

```typescript
import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
}

interface TypeStats {
  count: number;
  totalIncome: number;
  totalRead: number;
  totalInteraction: number;
}

export function ContentTypeComparisonPanel({ records }: Props) {
  const { articleStats, answerStats, monthlyData } = useMemo(() => {
    // Aggregate per content to avoid double-counting
    const contentMap = new Map<string, { type: string; income: number; read: number; interaction: number }>();
    for (const r of records) {
      const existing = contentMap.get(r.contentId);
      if (existing) {
        existing.income += r.currentIncome;
        existing.read += r.currentRead;
        existing.interaction += r.currentInteraction;
      } else {
        contentMap.set(r.contentId, {
          type: r.contentType,
          income: r.currentIncome,
          read: r.currentRead,
          interaction: r.currentInteraction,
        });
      }
    }

    const article: TypeStats = { count: 0, totalIncome: 0, totalRead: 0, totalInteraction: 0 };
    const answer: TypeStats = { count: 0, totalIncome: 0, totalRead: 0, totalInteraction: 0 };
    for (const v of contentMap.values()) {
      const target = v.type === 'article' ? article : answer;
      target.count++;
      target.totalIncome += v.income;
      target.totalRead += v.read;
      target.totalInteraction += v.interaction;
    }

    // Monthly data for grouped bar chart
    const monthMap = new Map<string, { articleIncome: number; answerIncome: number }>();
    for (const r of records) {
      const month = r.recordDate.slice(0, 7); // "2026-03"
      const existing = monthMap.get(month) ?? { articleIncome: 0, answerIncome: 0 };
      if (r.contentType === 'article') {
        existing.articleIncome += r.currentIncome;
      } else {
        existing.answerIncome += r.currentIncome;
      }
      monthMap.set(month, existing);
    }
    const months = Array.from(monthMap.keys()).sort();
    const monthly = months.map(m => ({ month: m, ...monthMap.get(m)! }));

    return { articleStats: article, answerStats: answer, monthlyData: monthly };
  }, [records]);

  const rpm = (income: number, read: number) =>
    read > 0 ? (income / 100 / read) * 1000 : 0;

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['文章', '回答'], textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 20, top: 30, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: monthlyData.map(d => d.month),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 10, formatter: (v: number) => `¥${(v / 100).toFixed(0)}` },
    },
    series: [
      {
        name: '文章',
        type: 'bar',
        data: monthlyData.map(d => d.articleIncome),
        itemStyle: { color: '#1a73e8', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 20,
      },
      {
        name: '回答',
        type: 'bar',
        data: monthlyData.map(d => d.answerIncome),
        itemStyle: { color: '#fbbc04', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 20,
      },
    ],
  };

  return (
    <Card title="文章 vs 回答" size="small">
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" style={{ background: '#f0f5ff', border: 'none' }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="blue">文章</Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{articleStats.count} 篇</span>
            </div>
            <Row gutter={8}>
              <Col span={8}>
                <Statistic title="总收益" value={articleStats.totalIncome / 100} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="篇均收益" value={articleStats.count > 0 ? articleStats.totalIncome / 100 / articleStats.count : 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="RPM" value={rpm(articleStats.totalIncome, articleStats.totalRead)} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" style={{ background: '#fffbe6', border: 'none' }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="gold">回答</Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{answerStats.count} 篇</span>
            </div>
            <Row gutter={8}>
              <Col span={8}>
                <Statistic title="总收益" value={answerStats.totalIncome / 100} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="篇均收益" value={answerStats.count > 0 ? answerStats.totalIncome / 100 / answerStats.count : 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="RPM" value={rpm(answerStats.totalIncome, answerStats.totalRead)} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      {monthlyData.length > 1 && (
        <ReactECharts option={chartOption} style={{ height: 220 }} />
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Add to Dashboard overview tab**

In `src/dashboard/Dashboard.tsx`, add the import:
```typescript
import { ContentTypeComparisonPanel } from './components/ContentTypeComparisonPanel';
```

In the overview tab's `<Flex vertical gap={24}>`, after `<DailyTrendChart>` and before the `<Row gutter={16}>` containing RPMForecastPanel, add:
```typescript
                      <ContentTypeComparisonPanel records={records} />
```

Note: `records` is already available in Dashboard from `useIncomeData`. However, we want to use **all** records not filtered by date. We need to pass `allIncomeRecords` as full IncomeRecord[]. Currently `allIncomeRecords` only stores `{ contentId, recordDate }`. We need the full records.

Instead, let's load all records in Dashboard. Find where `allIncomeRecords` is set:
```typescript
    db.incomeRecords.where('userId').equals(user.id).toArray().then(all => {
      setAllIncomeRecords(all.map(r => ({ contentId: r.contentId, recordDate: r.recordDate })));
    });
```

Change `allIncomeRecords` state type and setter. Replace:
```typescript
  const [allIncomeRecords, setAllIncomeRecords] = useState<{ contentId: string; recordDate: string }[]>([]);
```
with:
```typescript
  const [allIncomeRecords, setAllIncomeRecords] = useState<IncomeRecord[]>([]);
```

And add the import for `IncomeRecord` if not already present:
```typescript
import type { DailySummary, IncomeRecord } from '@/shared/types';
```

Change the fetch:
```typescript
    db.incomeRecords.where('userId').equals(user.id).toArray().then(all => {
      setAllIncomeRecords(all.map(r => ({ contentId: r.contentId, recordDate: r.recordDate })));
    });
```
to:
```typescript
    db.incomeRecords.where('userId').equals(user.id).toArray().then(setAllIncomeRecords);
```

Update `monetizedContentIds`:
```typescript
  const monetizedContentIds = useMemo(() => new Set(allIncomeRecords.map(r => r.contentId)), [allIncomeRecords]);
```
(This still works because IncomeRecord has `contentId`.)

Now pass `allIncomeRecords` to the panel:
```typescript
                      <ContentTypeComparisonPanel records={allIncomeRecords} />
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/ContentTypeComparisonPanel.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add article vs answer comparison panel"
```

---

### Task 5: Best Publish Time Analysis Panel

**Files:**
- Create: `src/dashboard/components/PublishTimeAnalysis.tsx`

- [ ] **Step 1: Create the PublishTimeAnalysis component**

Create `src/dashboard/components/PublishTimeAnalysis.tsx`:

```typescript
import React, { useMemo } from 'react';
import { Card, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';
import { parseDateString } from '@/shared/date-utils';

interface Props {
  records: IncomeRecord[];
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function PublishTimeAnalysis({ records }: Props) {
  const analysis = useMemo(() => {
    // Group records by contentId to get per-content data
    const contentMap = new Map<string, {
      publishDate: string;
      incomes: { date: string; income: number; read: number }[];
    }>();

    for (const r of records) {
      const existing = contentMap.get(r.contentId);
      if (existing) {
        existing.incomes.push({ date: r.recordDate, income: r.currentIncome, read: r.currentRead });
      } else {
        contentMap.set(r.contentId, {
          publishDate: r.publishDate,
          incomes: [{ date: r.recordDate, income: r.currentIncome, read: r.currentRead }],
        });
      }
    }

    // For each content, compute first-week income and reads
    // dayOfWeek: 0=Mon, 1=Tue, ..., 6=Sun (ISO style)
    const dayBuckets: { income: number; read: number; count: number }[] = Array.from(
      { length: 7 },
      () => ({ income: 0, read: 0, count: 0 }),
    );

    for (const [, content] of contentMap) {
      const pubDate = parseDateString(content.publishDate);
      const pubTime = pubDate.getTime();
      const weekEnd = pubTime + 7 * 24 * 60 * 60 * 1000;

      let firstWeekIncome = 0;
      let firstWeekRead = 0;
      for (const inc of content.incomes) {
        const incDate = parseDateString(inc.date);
        const incTime = incDate.getTime();
        if (incTime >= pubTime && incTime < weekEnd) {
          firstWeekIncome += inc.income;
          firstWeekRead += inc.read;
        }
      }

      // getDay(): 0=Sun, convert to 0=Mon
      const jsDay = pubDate.getDay();
      const isoDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun
      dayBuckets[isoDay].income += firstWeekIncome;
      dayBuckets[isoDay].read += firstWeekRead;
      dayBuckets[isoDay].count++;
    }

    const result = dayBuckets.map((b, i) => ({
      label: DAY_LABELS[i],
      avgIncome: b.count > 0 ? b.income / 100 / b.count : 0,
      avgRead: b.count > 0 ? b.read / b.count : 0,
      count: b.count,
    }));

    const best = result.reduce((a, b) => (b.avgIncome > a.avgIncome ? b : a), result[0]);

    return { result, best };
  }, [records]);

  const chartOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const item = analysis.result.find(r => r.label === params[0].name);
        const lines = params.map((p: any) =>
          p.seriesName === '平均首周收益'
            ? `${p.seriesName}: ¥${p.value.toFixed(2)}`
            : `${p.seriesName}: ${Math.round(p.value).toLocaleString()}`,
        );
        return `${params[0].name}（${item?.count ?? 0} 篇）<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['平均首周收益', '平均首周阅读'], textStyle: { fontSize: 11 }, right: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: analysis.result.map(r => r.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` },
        splitNumber: 3,
      },
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10 },
        splitNumber: 3,
        position: 'right' as const,
      },
    ],
    series: [
      {
        name: '平均首周收益',
        type: 'bar',
        data: analysis.result.map(r => r.avgIncome),
        yAxisIndex: 0,
        itemStyle: { color: '#1a73e8', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 30,
      },
      {
        name: '平均首周阅读',
        type: 'line',
        data: analysis.result.map(r => r.avgRead),
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: '#34a853' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
  };

  return (
    <Card title="最佳发布时间" size="small">
      <ReactECharts option={chartOption} style={{ height: 220 }} />
      {analysis.best && analysis.best.avgIncome > 0 && (
        <Alert
          type="info"
          showIcon
          message={
            <span style={{ fontSize: 12 }}>
              建议在<b>{analysis.best.label}</b>发布，平均首周收益最高（¥{analysis.best.avgIncome.toFixed(2)}，基于 {analysis.best.count} 篇统计）
            </span>
          }
          style={{ marginTop: 8 }}
        />
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Add to Dashboard overview tab**

In `src/dashboard/Dashboard.tsx`, add the import:
```typescript
import { PublishTimeAnalysis } from './components/PublishTimeAnalysis';
```

In the overview tab, after `<WeeklySeasonalityChart>` (inside the `<Col span={8}>`), add a new Row after the existing RPM+Seasonality row:

Find the section after `</Row>` (the one containing RPM and WeeklySeasonality) and before `<AnomalyDetectionPanel>`, add:
```typescript
                      <PublishTimeAnalysis records={allIncomeRecords} />
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/PublishTimeAnalysis.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add best publish time analysis panel"
```

---

### Task 6: Multi-Dimension Ranking Panel

**Files:**
- Create: `src/dashboard/components/MultiDimensionRanking.tsx`

- [ ] **Step 1: Create the MultiDimensionRanking component**

Create `src/dashboard/components/MultiDimensionRanking.tsx`:

```typescript
import React, { useMemo, useState } from 'react';
import { Card, Segmented, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
  onContentClick?: (item: { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }) => void;
}

type Dimension = 'income' | 'rpm' | 'growth' | 'engagement';

interface RankItem {
  rank: number;
  contentId: string;
  contentToken: string;
  title: string;
  contentType: string;
  publishDate: string;
  value: number;
  label: string;
}

export function MultiDimensionRanking({ records, onContentClick }: Props) {
  const [dimension, setDimension] = useState<Dimension>('income');

  const rankings = useMemo(() => {
    // Aggregate per content
    const contentMap = new Map<string, {
      contentId: string;
      contentToken: string;
      title: string;
      contentType: string;
      publishDate: string;
      totalIncome: number;
      totalRead: number;
      totalInteraction: number;
      recent7dIncome: number;
      prior7dIncome: number;
    }>();

    // Find the latest date in records to define "recent 7 days"
    let maxDate = '';
    for (const r of records) {
      if (r.recordDate > maxDate) maxDate = r.recordDate;
    }
    if (!maxDate) return { income: [], rpm: [], growth: [], engagement: [] };

    const maxDateObj = new Date(maxDate);
    const recent7Start = new Date(maxDateObj);
    recent7Start.setDate(recent7Start.getDate() - 6);
    const prior7Start = new Date(recent7Start);
    prior7Start.setDate(prior7Start.getDate() - 7);

    const toStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const recent7StartStr = toStr(recent7Start);
    const prior7StartStr = toStr(prior7Start);
    const prior7EndStr = toStr(new Date(recent7Start.getTime() - 86400000));

    for (const r of records) {
      let item = contentMap.get(r.contentId);
      if (!item) {
        item = {
          contentId: r.contentId,
          contentToken: r.contentToken,
          title: r.title,
          contentType: r.contentType,
          publishDate: r.publishDate,
          totalIncome: 0,
          totalRead: 0,
          totalInteraction: 0,
          recent7dIncome: 0,
          prior7dIncome: 0,
        };
        contentMap.set(r.contentId, item);
      }
      item.totalIncome += r.currentIncome;
      item.totalRead += r.currentRead;
      item.totalInteraction += r.currentInteraction;

      if (r.recordDate >= recent7StartStr && r.recordDate <= maxDate) {
        item.recent7dIncome += r.currentIncome;
      }
      if (r.recordDate >= prior7StartStr && r.recordDate <= prior7EndStr) {
        item.prior7dIncome += r.currentIncome;
      }
    }

    const items = Array.from(contentMap.values());

    // Income ranking
    const incomeRank = items
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.totalIncome / 100,
        label: `¥${(item.totalIncome / 100).toFixed(2)}`,
      }));

    // RPM ranking (filter read >= 100)
    const rpmRank = items
      .filter(i => i.totalRead >= 100)
      .map(i => ({ ...i, rpm: (i.totalIncome / 100 / i.totalRead) * 1000 }))
      .sort((a, b) => b.rpm - a.rpm)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.rpm,
        label: `¥${item.rpm.toFixed(2)}/千次`,
      }));

    // Growth ranking (prior7d > 0)
    const growthRank = items
      .filter(i => i.prior7dIncome > 0)
      .map(i => ({
        ...i,
        growth: ((i.recent7dIncome - i.prior7dIncome) / i.prior7dIncome) * 100,
      }))
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.growth,
        label: `${item.growth >= 0 ? '+' : ''}${item.growth.toFixed(1)}%`,
      }));

    // Engagement ranking (read >= 100)
    const engagementRank = items
      .filter(i => i.totalRead >= 100)
      .map(i => ({
        ...i,
        rate: (i.totalInteraction / i.totalRead) * 100,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.rate,
        label: `${item.rate.toFixed(2)}%`,
      }));

    return { income: incomeRank, rpm: rpmRank, growth: growthRank, engagement: engagementRank };
  }, [records]);

  const currentRanking = rankings[dimension];

  const columns: ColumnsType<RankItem> = [
    {
      title: '#', dataIndex: 'rank', key: 'rank', width: 40,
      render: (rank: number) => (
        <span style={{ fontWeight: rank <= 3 ? 700 : 400, color: rank <= 3 ? '#ea4335' : undefined }}>
          {rank}
        </span>
      ),
    },
    {
      title: '内容', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (title: string, row) => (
        <span>
          <Tag color={row.contentType === 'article' ? 'blue' : 'gold'} style={{ marginRight: 4 }}>
            {row.contentType === 'article' ? '文章' : '回答'}
          </Tag>
          {title}
        </span>
      ),
    },
    {
      title: '指标', dataIndex: 'label', key: 'label', width: 120, align: 'right' as const,
      render: (label: string) => <b>{label}</b>,
    },
  ];

  return (
    <Card title="多维度排行" size="small">
      <Segmented
        value={dimension}
        onChange={(v) => setDimension(v as Dimension)}
        options={[
          { label: '收益最高', value: 'income' },
          { label: 'RPM最高', value: 'rpm' },
          { label: '增长最快', value: 'growth' },
          { label: '互动率最高', value: 'engagement' },
        ]}
        style={{ marginBottom: 12 }}
        size="small"
      />
      <Table<RankItem>
        columns={columns}
        dataSource={currentRanking}
        rowKey="contentId"
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () => onContentClick?.({
            contentId: record.contentId,
            contentToken: record.contentToken,
            contentType: record.contentType,
            title: record.title,
            publishDate: record.publishDate,
          }),
          style: { cursor: onContentClick ? 'pointer' : undefined },
        })}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Add to Dashboard overview tab**

In `src/dashboard/Dashboard.tsx`, add the import:
```typescript
import { MultiDimensionRanking } from './components/MultiDimensionRanking';
```

In the overview tab's `<Flex vertical gap={24}>`, after `<AnomalyDetectionPanel>`, add:
```typescript
                      <MultiDimensionRanking records={allIncomeRecords} onContentClick={setSelectedContent} />
```

Note: `setSelectedContent` expects `ContentTableItem` but MultiDimensionRanking passes a subset. We need to adapt. Change the `onContentClick` handler to match.

Actually, `setSelectedContent` takes `ContentTableItem` which requires `currentIncome`, `currentRead`, `currentInteraction`. The ranking only passes basic fields. Instead, we should pass a callback that constructs the full object:

Replace the above with:
```typescript
                      <MultiDimensionRanking
                        records={allIncomeRecords}
                        onContentClick={(item) => setSelectedContent({
                          ...item,
                          currentIncome: 0,
                          currentRead: 0,
                          currentInteraction: 0,
                        })}
                      />
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/MultiDimensionRanking.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add multi-dimension content ranking panel"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run existing tests**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vitest run 2>&1 | tail -15`
Expected: All existing tests pass

- [ ] **Step 3: Commit if any remaining changes**

```bash
git status
# If clean, no commit needed
```
