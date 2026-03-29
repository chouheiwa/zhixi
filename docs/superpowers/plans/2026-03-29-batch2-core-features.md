# Batch 2: Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 features: income goal tracking with progress bar, content comparison page, Excel report export, and milestones/achievements system.

**Architecture:** Add `incomeGoals` store to DB v7, create goal-store CRUD, build 4 new components. ContentComparePage is a full-page view (like ContentDetailPage). Excel export uses SheetJS to generate multi-sheet workbooks. Milestones are computed in real-time from existing data.

**Tech Stack:** React 18, TypeScript, Ant Design 6.3, ECharts 5.6, Dexie 4.0, xlsx (SheetJS)

**Prerequisites:** Batch 1 must be complete (Dashboard.tsx uses `allIncomeRecords` as `IncomeRecord[]`).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/db/database.ts` | Modify | Add v7 with incomeGoals store |
| `src/db/goal-store.ts` | Create | CRUD for income goals |
| `src/dashboard/components/IncomeGoalPanel.tsx` | Create | Goal setting + progress tracking |
| `src/dashboard/components/ContentComparePage.tsx` | Create | Side-by-side content comparison |
| `src/dashboard/components/ContentTable.tsx` | Modify | Add "对比" button for selected items |
| `src/dashboard/components/ContentDetailPage.tsx` | Modify | Add "添加到对比" button |
| `src/dashboard/components/ExcelExportButton.tsx` | Create | Excel report generation |
| `src/dashboard/components/MilestonesPage.tsx` | Create | Achievement milestones |
| `src/dashboard/Dashboard.tsx` | Modify | Wire up all new components |
| `package.json` | Modify | Add xlsx dependency |

---

### Task 1: Install xlsx dependency

- [ ] **Step 1: Install SheetJS**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm install xlsx`

- [ ] **Step 2: Verify it installed**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && node -e "require('xlsx'); console.log('OK')"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx (SheetJS) dependency"
```

---

### Task 2: DB v7 + Goal Store

**Files:**
- Modify: `src/db/database.ts`
- Create: `src/db/goal-store.ts`

- [ ] **Step 1: Add incomeGoals table to database**

In `src/db/database.ts`, add the `IncomeGoal` interface after `SavedMLModel`:

```typescript
export interface IncomeGoal {
  userId: string;
  period: string; // "2026-03" for monthly
  targetAmount: number; // in fen (cents)
  createdAt: number;
}
```

Add the table declaration in the class:
```typescript
  incomeGoals!: Table<IncomeGoal>;
```

Add version 7 after version 6:
```typescript
    this.version(7).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
    });
```

- [ ] **Step 2: Create goal-store.ts**

Create `src/db/goal-store.ts`:

```typescript
import { db, type IncomeGoal } from './database';

export async function getGoal(userId: string, period: string): Promise<IncomeGoal | undefined> {
  return db.incomeGoals.get([userId, period]);
}

export async function saveGoal(goal: IncomeGoal): Promise<void> {
  await db.incomeGoals.put(goal);
}

export async function deleteGoal(userId: string, period: string): Promise<void> {
  await db.incomeGoals.delete([userId, period]);
}

export async function getAllGoals(userId: string): Promise<IncomeGoal[]> {
  return db.incomeGoals.where('userId').equals(userId).toArray();
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/db/database.ts src/db/goal-store.ts
git commit -m "feat: add incomeGoals store (DB v7) and goal-store CRUD"
```

---

### Task 3: Income Goal Panel

**Files:**
- Create: `src/dashboard/components/IncomeGoalPanel.tsx`
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create the IncomeGoalPanel component**

Create `src/dashboard/components/IncomeGoalPanel.tsx`:

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, InputNumber, Progress, Flex, Statistic } from 'antd';
import { TrophyOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getGoal, saveGoal, deleteGoal } from '@/db/goal-store';
import type { IncomeGoal } from '@/db/database';

interface Props {
  userId: string;
  monthIncome: number; // in yuan, current month cumulative
  monthDaysElapsed: number;
  monthDaysTotal: number;
}

export function IncomeGoalPanel({ userId, monthIncome, monthDaysElapsed, monthDaysTotal }: Props) {
  const [goal, setGoal] = useState<IncomeGoal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const loadGoal = useCallback(async () => {
    const g = await getGoal(userId, period);
    setGoal(g ?? null);
    setLoading(false);
  }, [userId, period]);

  useEffect(() => { loadGoal(); }, [loadGoal]);

  const handleSave = async () => {
    if (!inputValue || inputValue <= 0) return;
    await saveGoal({
      userId,
      period,
      targetAmount: Math.round(inputValue * 100),
      createdAt: Date.now(),
    });
    setModalOpen(false);
    setInputValue(null);
    loadGoal();
  };

  const handleDelete = async () => {
    await deleteGoal(userId, period);
    loadGoal();
  };

  if (loading) return null;

  if (!goal) {
    return (
      <Card size="small" style={{ background: '#fafafa', border: '1px dashed #d9d9d9' }}>
        <Flex justify="center" align="center" gap={8} style={{ padding: 8 }}>
          <TrophyOutlined style={{ color: '#faad14', fontSize: 18 }} />
          <Button type="primary" ghost size="small" onClick={() => setModalOpen(true)}>
            设定本月收益目标
          </Button>
        </Flex>
        <Modal
          title="设定本月收益目标"
          open={modalOpen}
          onOk={handleSave}
          onCancel={() => { setModalOpen(false); setInputValue(null); }}
          okText="保存"
          cancelText="取消"
        >
          <InputNumber
            value={inputValue}
            onChange={setInputValue}
            min={1}
            precision={0}
            prefix="¥"
            placeholder="输入目标金额（元）"
            style={{ width: '100%', marginTop: 16 }}
            size="large"
          />
        </Modal>
      </Card>
    );
  }

  const target = goal.targetAmount / 100;
  const percent = target > 0 ? Math.min((monthIncome / target) * 100, 100) : 0;
  const dailyAvg = monthDaysElapsed > 0 ? monthIncome / monthDaysElapsed : 0;
  const daysRemaining = monthDaysTotal - monthDaysElapsed;
  const projected = monthIncome + dailyAvg * daysRemaining;

  const progressColor = percent < 50 ? '#1890ff' : percent < 80 ? '#fa8c16' : '#52c41a';

  return (
    <Card
      size="small"
      title={<><TrophyOutlined style={{ color: '#faad14' }} /> 本月目标</>}
      extra={
        <Flex gap={4}>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setInputValue(target); setModalOpen(true); }}
          />
          <Button type="text" size="small" icon={<DeleteOutlined />} onClick={handleDelete} />
        </Flex>
      }
    >
      <Progress
        percent={Math.round(percent)}
        strokeColor={progressColor}
        format={() => `${percent.toFixed(1)}%`}
      />
      <Flex justify="space-between" style={{ marginTop: 8 }}>
        <Statistic
          title="已达成"
          value={monthIncome}
          precision={2}
          prefix="¥"
          valueStyle={{ fontSize: 16 }}
        />
        <Statistic
          title="目标"
          value={target}
          precision={0}
          prefix="¥"
          valueStyle={{ fontSize: 16, color: '#999' }}
        />
        <Statistic
          title="月底预计"
          value={projected}
          precision={2}
          prefix="¥"
          valueStyle={{ fontSize: 16, color: projected >= target ? '#52c41a' : '#fa8c16' }}
        />
      </Flex>
      <div style={{ fontSize: 11, color: '#999', marginTop: 4, textAlign: 'center' }}>
        按当前日均 ¥{dailyAvg.toFixed(2)}，还剩 {daysRemaining} 天
      </div>

      <Modal
        title="修改本月收益目标"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setInputValue(null); }}
        okText="保存"
        cancelText="取消"
      >
        <InputNumber
          value={inputValue}
          onChange={setInputValue}
          min={1}
          precision={0}
          prefix="¥"
          placeholder="输入目标金额（元）"
          style={{ width: '100%', marginTop: 16 }}
          size="large"
        />
      </Modal>
    </Card>
  );
}
```

- [ ] **Step 2: Add IncomeGoalPanel to Dashboard overview tab**

In `src/dashboard/Dashboard.tsx`, add the import:
```typescript
import { IncomeGoalPanel } from './components/IncomeGoalPanel';
```

Compute month days info inside the `stats` useMemo. Add to the return value:
```typescript
      // Month day counts for goal panel
      const monthDaysElapsed = now.getDate();
      const monthDaysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
```

And include in the return object:
```typescript
      monthDaysElapsed, monthDaysTotal,
```

In the overview tab's `<Flex vertical gap={24}>`, as the **first** item (before DailyTrendChart), add:
```typescript
                      {user && (
                        <IncomeGoalPanel
                          userId={user.id}
                          monthIncome={stats.monthIncome}
                          monthDaysElapsed={stats.monthDaysElapsed}
                          monthDaysTotal={stats.monthDaysTotal}
                        />
                      )}
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/IncomeGoalPanel.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add income goal panel with progress tracking and projection"
```

---

### Task 4: Content Comparison Page

**Files:**
- Create: `src/dashboard/components/ContentComparePage.tsx`
- Modify: `src/dashboard/components/ContentTable.tsx`
- Modify: `src/dashboard/components/ContentDetailPage.tsx`
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create ContentComparePage component**

Create `src/dashboard/components/ContentComparePage.tsx`:

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Select, Tag, Button, Row, Col, Table, Flex, Empty } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { getContentDailyRecords } from '@/db/content-daily-store';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';

interface ContentOption {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
}

interface Props {
  initialItems?: ContentOption[];
  allContentOptions: ContentOption[];
  onBack: () => void;
}

const COLORS = ['#1a73e8', '#ea4335', '#34a853'];

export function ContentComparePage({ initialItems, allContentOptions, onBack }: Props) {
  const { user } = useCurrentUser();
  const [selected, setSelected] = useState<ContentOption[]>(initialItems ?? []);
  const [dailyMap, setDailyMap] = useState<Map<string, ContentDailyRecord[]>>(new Map());
  const [incomeMap, setIncomeMap] = useState<Map<string, IncomeRecord[]>>(new Map());

  // Load data for selected items
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const newDailyMap = new Map<string, ContentDailyRecord[]>();
      const newIncomeMap = new Map<string, IncomeRecord[]>();

      for (const item of selected) {
        const daily = await getContentDailyRecords(user.id, item.contentToken);
        newDailyMap.set(item.contentId, daily.sort((a, b) => a.date.localeCompare(b.date)));

        const income = await db.incomeRecords
          .where('[userId+contentId+recordDate]')
          .between([user.id, item.contentId, ''], [user.id, item.contentId, '\uffff'])
          .sortBy('recordDate');
        newIncomeMap.set(item.contentId, income);
      }

      setDailyMap(newDailyMap);
      setIncomeMap(newIncomeMap);
    };
    loadData();
  }, [user, selected]);

  const handleAdd = (contentId: string) => {
    if (selected.length >= 3) return;
    const item = allContentOptions.find(o => o.contentId === contentId);
    if (item && !selected.find(s => s.contentId === contentId)) {
      setSelected([...selected, item]);
    }
  };

  const handleRemove = (contentId: string) => {
    setSelected(selected.filter(s => s.contentId !== contentId));
  };

  // Build unified date axis
  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const records of dailyMap.values()) {
      for (const r of records) dateSet.add(r.date);
    }
    for (const records of incomeMap.values()) {
      for (const r of records) dateSet.add(r.recordDate);
    }
    return Array.from(dateSet).sort();
  }, [dailyMap, incomeMap]);

  const makeLineChart = (title: string, getData: (contentId: string, date: string) => number) => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: selected.map(s => s.title.slice(0, 15)), textStyle: { fontSize: 10 }, right: 0 },
    grid: withZoomGrid({ left: 50, right: 20, top: 30, bottom: 25 }),
    xAxis: { type: 'category' as const, data: allDates.map(d => d.slice(5)), axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3 },
    series: selected.map((item, idx) => ({
      name: item.title.slice(0, 15),
      type: 'line',
      data: allDates.map(d => getData(item.contentId, d)),
      smooth: true,
      itemStyle: { color: COLORS[idx] },
      lineStyle: { width: 2 },
      symbol: 'none',
    })),
    ...timeSeriesZoom,
  });

  const readChart = makeLineChart('每日阅读', (cid, date) => {
    const records = dailyMap.get(cid);
    const r = records?.find(r => r.date === date);
    return r?.pv ?? 0;
  });

  const incomeChart = makeLineChart('每日收益', (cid, date) => {
    const records = incomeMap.get(cid);
    const r = records?.find(r => r.recordDate === date);
    return r ? r.currentIncome / 100 : 0;
  });

  // Cumulative income
  const cumulativeChart = (() => {
    const cumulatives = selected.map(item => {
      const records = incomeMap.get(item.contentId) ?? [];
      let cumulative = 0;
      const dateIncomeMap = new Map<string, number>();
      for (const r of records) {
        cumulative += r.currentIncome / 100;
        dateIncomeMap.set(r.recordDate, cumulative);
      }
      return { item, dateIncomeMap, lastCumulative: cumulative };
    });

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: selected.map(s => s.title.slice(0, 15)), textStyle: { fontSize: 10 }, right: 0 },
      grid: withZoomGrid({ left: 50, right: 20, top: 30, bottom: 25 }),
      xAxis: { type: 'category' as const, data: allDates.map(d => d.slice(5)), axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` }, splitNumber: 3 },
      series: cumulatives.map((c, idx) => {
        let running = 0;
        return {
          name: c.item.title.slice(0, 15),
          type: 'line',
          data: allDates.map(d => {
            const inc = incomeMap.get(c.item.contentId)?.find(r => r.recordDate === d);
            if (inc) running += inc.currentIncome / 100;
            return running;
          }),
          smooth: true,
          itemStyle: { color: COLORS[idx] },
          lineStyle: { width: 2 },
          symbol: 'none',
          areaStyle: { opacity: 0.05 },
        };
      }),
      ...timeSeriesZoom,
    };
  })();

  // Summary table
  const summaryData = useMemo(() => {
    const metrics = ['总收益', '总阅读', 'RPM', '平均日收益', '互动率'];
    return metrics.map(metric => {
      const row: Record<string, string | number> = { metric };
      for (const item of selected) {
        const incomes = incomeMap.get(item.contentId) ?? [];
        const totalIncome = incomes.reduce((sum, r) => sum + r.currentIncome, 0);
        const totalRead = incomes.reduce((sum, r) => sum + r.currentRead, 0);
        const totalInteraction = incomes.reduce((sum, r) => sum + r.currentInteraction, 0);
        const days = incomes.length;

        let value: string;
        switch (metric) {
          case '总收益': value = `¥${(totalIncome / 100).toFixed(2)}`; break;
          case '总阅读': value = totalRead.toLocaleString(); break;
          case 'RPM': value = totalRead > 0 ? `¥${((totalIncome / 100 / totalRead) * 1000).toFixed(2)}` : '-'; break;
          case '平均日收益': value = days > 0 ? `¥${(totalIncome / 100 / days).toFixed(2)}` : '-'; break;
          case '互动率': value = totalRead > 0 ? `${((totalInteraction / totalRead) * 100).toFixed(2)}%` : '-'; break;
          default: value = '-';
        }
        row[item.contentId] = value;
      }
      return row;
    });
  }, [selected, incomeMap]);

  const selectOptions = allContentOptions
    .filter(o => !selected.find(s => s.contentId === o.contentId))
    .map(o => ({
      value: o.contentId,
      label: `${o.contentType === 'article' ? '[文章]' : '[回答]'} ${o.title}`,
    }));

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex gap={8} wrap="wrap" align="center">
          {selected.map((item, idx) => (
            <Tag
              key={item.contentId}
              color={COLORS[idx]}
              closable
              onClose={() => handleRemove(item.contentId)}
            >
              {item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title}
            </Tag>
          ))}
          {selected.length < 3 && (
            <Select
              showSearch
              placeholder="搜索添加内容（最多3篇）"
              options={selectOptions}
              onSelect={handleAdd}
              value={null}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
              }
              style={{ width: 280 }}
              size="small"
            />
          )}
        </Flex>
      </Card>

      {selected.length < 2 ? (
        <Empty description="请选择至少 2 篇内容进行对比" />
      ) : (
        <>
          <Row gutter={16}>
            <Col span={12}>
              <Card title="每日阅读量对比" size="small">
                <ReactECharts option={readChart} style={{ height: 220 }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="每日收益对比" size="small">
                <ReactECharts option={incomeChart} style={{ height: 220 }} />
              </Card>
            </Col>
          </Row>
          <Card title="累计收益对比" size="small" style={{ marginTop: 16 }}>
            <ReactECharts option={cumulativeChart} style={{ height: 220 }} />
          </Card>
          <Card title="指标汇总" size="small" style={{ marginTop: 16 }}>
            <Table
              dataSource={summaryData}
              rowKey="metric"
              size="small"
              pagination={false}
              columns={[
                { title: '指标', dataIndex: 'metric', key: 'metric', width: 100 },
                ...selected.map((item, idx) => ({
                  title: (
                    <span>
                      <Tag color={COLORS[idx]} style={{ marginRight: 4 }}>
                        {item.contentType === 'article' ? '文章' : '回答'}
                      </Tag>
                      {item.title.length > 12 ? item.title.slice(0, 12) + '...' : item.title}
                    </span>
                  ),
                  dataIndex: item.contentId,
                  key: item.contentId,
                  align: 'right' as const,
                })),
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add compare button to ContentTable**

In `src/dashboard/components/ContentTable.tsx`, add a new prop:

Change the Props interface:
```typescript
interface Props {
  records: IncomeRecord[];
  onContentClick: (item: ContentTableItem) => void;
}
```
to:
```typescript
interface Props {
  records: IncomeRecord[];
  onContentClick: (item: ContentTableItem) => void;
  onCompare?: (items: ContentTableItem[]) => void;
}
```

Update the component signature:
```typescript
export function ContentTable({ records, onContentClick, onCompare }: Props) {
```

In the `<Space>` area where selectedKeys are shown, after "批量拉取详情" button, add:
```typescript
            {onCompare && selectedKeys.length >= 2 && selectedKeys.length <= 3 && (
              <Button
                size="small"
                onClick={() => {
                  const items = aggregated.filter(i => selectedKeys.includes(i.contentId));
                  onCompare(items);
                }}
              >
                对比 ({selectedKeys.length})
              </Button>
            )}
```

- [ ] **Step 3: Add compare button to ContentDetailPage**

In `src/dashboard/components/ContentDetailPage.tsx`, add a new prop:

```typescript
interface Props {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
  onBack: () => void;
  onCompare?: (item: { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }) => void;
}
```

Update the component signature to include `onCompare`.

Add a button in the header area (near the reload button or at the top):
```typescript
        {onCompare && (
          <Button
            size="small"
            onClick={() => onCompare({ contentId, contentToken, contentType, title, publishDate })}
            style={{ marginLeft: 8 }}
          >
            添加到对比
          </Button>
        )}
```

- [ ] **Step 4: Wire up comparison in Dashboard**

In `src/dashboard/Dashboard.tsx`, add:

```typescript
import { ContentComparePage } from './components/ContentComparePage';
```

Add state:
```typescript
  const [compareItems, setCompareItems] = useState<ContentTableItem[] | null>(null);
```

Build allContentOptions from allIncomeRecords:
```typescript
  const allContentOptions = useMemo(() => {
    const map = new Map<string, { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }>();
    for (const r of allIncomeRecords) {
      if (!map.has(r.contentId)) {
        map.set(r.contentId, {
          contentId: r.contentId, contentToken: r.contentToken,
          contentType: r.contentType, title: r.title, publishDate: r.publishDate,
        });
      }
    }
    return Array.from(map.values());
  }, [allIncomeRecords]);
```

Add compare page rendering. In the `if (selectedContent)` block, also check for compareItems. Before `if (selectedContent)`:

```typescript
  if (compareItems) {
    return (
      <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: 24, background: 'transparent' }}>
        <Content>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setCompareItems(null)} style={{ marginBottom: 16 }}>
            返回
          </Button>
          <ContentComparePage
            initialItems={compareItems}
            allContentOptions={allContentOptions}
            onBack={() => setCompareItems(null)}
          />
        </Content>
      </Layout>
    );
  }
```

Pass `onCompare` to ContentTable:
```typescript
                      <ContentTable
                        records={records}
                        onContentClick={setSelectedContent}
                        onCompare={(items) => setCompareItems(items)}
                      />
```

Pass `onCompare` to ContentDetailPage:
```typescript
          <ContentDetailPage
            contentId={selectedContent.contentId}
            contentToken={selectedContent.contentToken}
            contentType={selectedContent.contentType}
            title={selectedContent.title}
            publishDate={selectedContent.publishDate}
            onBack={() => setSelectedContent(null)}
            onCompare={(item) => {
              setSelectedContent(null);
              setCompareItems([item as any]);
            }}
          />
```

- [ ] **Step 5: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/components/ContentComparePage.tsx src/dashboard/components/ContentTable.tsx src/dashboard/components/ContentDetailPage.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add content comparison page with three entry points"
```

---

### Task 5: Excel Report Export

**Files:**
- Create: `src/dashboard/components/ExcelExportButton.tsx`
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create ExcelExportButton component**

Create `src/dashboard/components/ExcelExportButton.tsx`:

```typescript
import * as XLSX from 'xlsx';
import type { DailySummary, IncomeRecord } from '@/shared/types';

interface ExportParams {
  userName: string;
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

export function generateExcelReport({ userName, allSummaries, allRecords }: ExportParams): void {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Summary ---
  const totalIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0) / 100;
  const totalRead = allSummaries.reduce((s, d) => s + d.totalRead, 0);
  const days = allSummaries.length;

  const contentMap = new Map<string, { type: string; income: number; read: number; interaction: number }>();
  for (const r of allRecords) {
    const existing = contentMap.get(r.contentId);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.interaction += r.currentInteraction;
    } else {
      contentMap.set(r.contentId, { type: r.contentType, income: r.currentIncome, read: r.currentRead, interaction: r.currentInteraction });
    }
  }
  const contentCount = contentMap.size;
  const articleCount = Array.from(contentMap.values()).filter(c => c.type === 'article').length;
  const answerCount = contentCount - articleCount;

  const summaryData = [
    ['指标', '值'],
    ['数据范围', allSummaries.length > 0 ? `${allSummaries[0].date} ~ ${allSummaries[allSummaries.length - 1].date}` : '-'],
    ['总收益', `¥${totalIncome.toFixed(2)}`],
    ['总阅读量', totalRead],
    ['平均RPM', totalRead > 0 ? `¥${((totalIncome / totalRead) * 1000).toFixed(2)}` : '-'],
    ['内容总数', `${contentCount}篇`],
    ['文章数', `${articleCount}篇`],
    ['回答数', `${answerCount}篇`],
    ['日均收益', days > 0 ? `¥${(totalIncome / days).toFixed(2)}` : '-'],
    ['采集天数', `${days}天`],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 15 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, '摘要');

  // --- Sheet 2: Daily Summary ---
  const dailyHeader = ['日期', '收益(元)', '阅读量', '互动量', '内容篇数', 'RPM'];
  const dailyRows = allSummaries.map(s => [
    s.date,
    +(s.totalIncome / 100).toFixed(2),
    s.totalRead,
    s.totalInteraction,
    s.contentCount,
    s.totalRead > 0 ? +((s.totalIncome / 100 / s.totalRead) * 1000).toFixed(2) : 0,
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyRows]);
  ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, '每日汇总');

  // --- Sheet 3: Content Details ---
  // Aggregate per content with engagement breakdown from contentDaily if available
  const contentHeader = ['标题', '类型', '发布日期', '总收益(元)', '总阅读', '总互动', 'RPM'];
  const contentRows: (string | number)[][] = [];

  // Group records by contentId for full aggregation
  const contentAgg = new Map<string, {
    title: string; type: string; publishDate: string;
    income: number; read: number; interaction: number;
  }>();
  for (const r of allRecords) {
    const existing = contentAgg.get(r.contentId);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.interaction += r.currentInteraction;
    } else {
      contentAgg.set(r.contentId, {
        title: r.title,
        type: r.contentType === 'article' ? '文章' : '回答',
        publishDate: r.publishDate,
        income: r.currentIncome,
        read: r.currentRead,
        interaction: r.currentInteraction,
      });
    }
  }

  for (const c of Array.from(contentAgg.values()).sort((a, b) => b.income - a.income)) {
    contentRows.push([
      c.title,
      c.type,
      c.publishDate,
      +(c.income / 100).toFixed(2),
      c.read,
      c.interaction,
      c.read > 0 ? +((c.income / 100 / c.read) * 1000).toFixed(2) : 0,
    ]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet([contentHeader, ...contentRows]);
  ws3['!cols'] = [{ wch: 40 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, '内容明细');

  // --- Sheet 4: Monthly Summary ---
  const monthAgg = new Map<string, { income: number; read: number; contentIds: Set<string> }>();
  for (const r of allRecords) {
    const month = r.recordDate.slice(0, 7);
    const existing = monthAgg.get(month);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.contentIds.add(r.contentId);
    } else {
      monthAgg.set(month, { income: r.currentIncome, read: r.currentRead, contentIds: new Set([r.contentId]) });
    }
  }

  const months = Array.from(monthAgg.keys()).sort();
  const monthlyHeader = ['月份', '收益(元)', '阅读量', '内容篇数', 'RPM', '环比增长(%)'];
  const monthlyRows = months.map((month, idx) => {
    const m = monthAgg.get(month)!;
    const income = m.income / 100;
    const rpm = m.read > 0 ? (income / m.read) * 1000 : 0;
    let growth = '-';
    if (idx > 0) {
      const prevIncome = monthAgg.get(months[idx - 1])!.income / 100;
      if (prevIncome > 0) {
        growth = (((income - prevIncome) / prevIncome) * 100).toFixed(1);
      }
    }
    return [month, +income.toFixed(2), m.read, m.contentIds.size, +rpm.toFixed(2), growth];
  });
  const ws4 = XLSX.utils.aoa_to_sheet([monthlyHeader, ...monthlyRows]);
  ws4['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws4, '按月汇总');

  // --- Download ---
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `知析报告-${userName}-${today}.xlsx`);
}
```

- [ ] **Step 2: Add Excel export to Dashboard settings dropdown**

In `src/dashboard/Dashboard.tsx`, add the import:
```typescript
import { generateExcelReport } from './components/ExcelExportButton';
```

In the settings dropdown items array, after the `export` item (`{ key: 'export', ... }`), add:
```typescript
                  {
                    key: 'exportExcel',
                    icon: <DownloadOutlined />,
                    label: '导出 Excel 报告',
                    onClick: () => {
                      if (user && allSummaries.length > 0) {
                        generateExcelReport({
                          userName: user.name,
                          allSummaries,
                          allRecords: allIncomeRecords,
                        });
                      }
                    },
                  },
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/ExcelExportButton.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add Excel report export with 4 sheets"
```

---

### Task 6: Milestones & Achievements

**Files:**
- Create: `src/dashboard/components/MilestonesPage.tsx`
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create MilestonesPage component**

Create `src/dashboard/components/MilestonesPage.tsx`:

```typescript
import React, { useMemo } from 'react';
import { Card, List, Tag, Flex, Progress } from 'antd';
import { TrophyOutlined, LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { DailySummary, IncomeRecord } from '@/shared/types';

interface Props {
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

interface Milestone {
  category: string;
  name: string;
  target: number;
  unit: string;
  achieved: boolean;
  achievedDate?: string;
  current: number;
}

export function MilestonesPage({ allSummaries, allRecords }: Props) {
  const milestones = useMemo(() => {
    // Compute aggregates
    const totalIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0) / 100;

    let maxDailyIncome = 0;
    for (const s of allSummaries) {
      const dayIncome = s.totalIncome / 100;
      if (dayIncome > maxDailyIncome) maxDailyIncome = dayIncome;
    }

    const contentIds = new Set<string>();
    for (const r of allRecords) contentIds.add(r.contentId);
    const contentCount = contentIds.size;

    // Consecutive income days
    let maxStreak = 0;
    let currentStreak = 0;
    const sortedSummaries = [...allSummaries].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sortedSummaries.length; i++) {
      if (sortedSummaries[i].totalIncome > 0) {
        currentStreak++;
        if (i > 0) {
          const prev = new Date(sortedSummaries[i - 1].date);
          const curr = new Date(sortedSummaries[i].date);
          const diff = (curr.getTime() - prev.getTime()) / 86400000;
          if (diff !== 1) currentStreak = 1;
        }
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    // Find achieved date for cumulative income milestones
    const findCumulativeDate = (threshold: number): string | undefined => {
      let cumulative = 0;
      for (const s of sortedSummaries) {
        cumulative += s.totalIncome / 100;
        if (cumulative >= threshold) return s.date;
      }
      return undefined;
    };

    // Find date of max daily income
    const maxDailyDate = sortedSummaries.find(s => s.totalIncome / 100 === maxDailyIncome)?.date;

    const result: Milestone[] = [];

    // Cumulative income milestones
    for (const target of [10, 50, 100, 500, 1000, 5000, 10000]) {
      const date = findCumulativeDate(target);
      result.push({
        category: '累计收益',
        name: `累计收益达到 ¥${target}`,
        target,
        unit: '元',
        achieved: totalIncome >= target,
        achievedDate: date,
        current: totalIncome,
      });
    }

    // Single-day max milestones
    for (const target of [1, 5, 10, 50]) {
      result.push({
        category: '单日最高',
        name: `单日收益突破 ¥${target}`,
        target,
        unit: '元',
        achieved: maxDailyIncome >= target,
        achievedDate: maxDailyIncome >= target ? maxDailyDate : undefined,
        current: maxDailyIncome,
      });
    }

    // Content count milestones
    for (const target of [10, 50, 100]) {
      result.push({
        category: '内容数量',
        name: `产出内容达到 ${target} 篇`,
        target,
        unit: '篇',
        achieved: contentCount >= target,
        current: contentCount,
      });
    }

    // Consecutive days milestones
    for (const target of [7, 30, 90]) {
      result.push({
        category: '连续收益',
        name: `连续 ${target} 天有收益`,
        target,
        unit: '天',
        achieved: maxStreak >= target,
        current: maxStreak,
      });
    }

    return result;
  }, [allSummaries, allRecords]);

  // Group by category
  const categories = ['累计收益', '单日最高', '内容数量', '连续收益'];

  return (
    <Flex vertical gap={16}>
      {categories.map(category => {
        const items = milestones.filter(m => m.category === category);
        const achieved = items.filter(m => m.achieved).length;
        return (
          <Card
            key={category}
            title={<><TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />{category}</>}
            size="small"
            extra={<Tag color={achieved === items.length ? 'green' : 'default'}>{achieved}/{items.length}</Tag>}
          >
            <List
              size="small"
              dataSource={items}
              renderItem={(item) => (
                <List.Item>
                  <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                    <Flex align="center" gap={8}>
                      {item.achieved ? (
                        <CheckCircleFilled style={{ color: '#52c41a' }} />
                      ) : (
                        <LockOutlined style={{ color: '#d9d9d9' }} />
                      )}
                      <span style={{ color: item.achieved ? undefined : '#999' }}>
                        {item.name}
                      </span>
                    </Flex>
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {item.achieved
                        ? item.achievedDate ?? '已达成'
                        : `还差 ${(item.target - item.current).toFixed(item.unit === '元' ? 2 : 0)} ${item.unit}`
                      }
                    </span>
                  </Flex>
                </List.Item>
              )}
            />
          </Card>
        );
      })}
    </Flex>
  );
}
```

- [ ] **Step 2: Add milestones entry to Dashboard settings dropdown**

In `src/dashboard/Dashboard.tsx`, add:
```typescript
import { MilestonesPage } from './components/MilestonesPage';
```

Add state:
```typescript
  const [milestonesOpen, setMilestonesOpen] = useState(false);
```

Add `Drawer` import from antd (if not already there, add `Drawer` to the antd import):
```typescript
import { Layout, Tabs, Spin, Empty, Row, Col, Statistic, Card, Flex, DatePicker, Space, Button, theme, Dropdown, Progress, Alert, Modal, Drawer } from 'antd';
```

Add to settings dropdown items (after autoSync, before info):
```typescript
                  {
                    key: 'milestones',
                    icon: <TrophyOutlined />,
                    label: '成就记录',
                    onClick: () => setMilestonesOpen(true),
                  },
```

Add TrophyOutlined to the icons import:
```typescript
import { ArrowLeftOutlined, SyncOutlined, DownloadOutlined, UploadOutlined, SettingOutlined, DatabaseOutlined, CloudDownloadOutlined, TrophyOutlined } from '@ant-design/icons';
```

Add the Drawer component inside the return JSX, just before `</Content>`:
```typescript
        <Drawer
          title="成就记录"
          open={milestonesOpen}
          onClose={() => setMilestonesOpen(false)}
          width={480}
        >
          <MilestonesPage allSummaries={allSummaries} allRecords={allIncomeRecords} />
        </Drawer>
```

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/components/MilestonesPage.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add milestones and achievements system"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run existing tests**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vitest run 2>&1 | tail -15`
Expected: All existing tests pass
