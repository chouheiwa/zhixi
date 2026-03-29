# Batch 3: Dashboard Panel Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Dashboard rendering from hardcoded tabs/panels to a registry-driven, user-customizable layout with drag-and-drop reordering and show/hide toggles for all tabs and panels.

**Architecture:** Create a panel registry that maps panel keys to components + metadata. A `usePanelLayout` hook manages persisted layout config. Dashboard reads the registry + user layout to render tabs/panels dynamically. A LayoutCustomizer drawer provides the drag-and-drop UI.

**Tech Stack:** React 18, TypeScript, Ant Design 6.3, @dnd-kit/core + @dnd-kit/sortable, Dexie 4.0

**Prerequisites:** Batches 1 and 2 must be complete. All panels exist and are registered.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add @dnd-kit dependencies |
| `src/db/database.ts` | Modify | Add panelLayout store (v7 or v8) |
| `src/shared/types.ts` | Modify | Add PanelConfig, TabConfig, PanelLayout types |
| `src/dashboard/panel-registry.ts` | Create | Central panel metadata registry |
| `src/hooks/use-panel-layout.ts` | Create | Layout persistence hook |
| `src/dashboard/components/LayoutCustomizer.tsx` | Create | Drag-and-drop layout editor |
| `src/dashboard/Dashboard.tsx` | Modify | Refactor to registry-driven rendering |

---

### Task 1: Install @dnd-kit dependencies

- [ ] **Step 1: Install packages**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [ ] **Step 2: Verify installed**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); console.log('OK')"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit dependencies for panel customization"
```

---

### Task 2: Types + DB Schema for Panel Layout

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/db/database.ts`

- [ ] **Step 1: Add layout types to types.ts**

At the end of `src/shared/types.ts`, add:

```typescript
/** Panel visibility and order within a tab */
export interface PanelConfig {
  key: string;
  visible: boolean;
  order: number;
}

/** Tab visibility, order, and child panel configuration */
export interface TabConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  panels: PanelConfig[];
}

/** User's customized dashboard layout */
export interface PanelLayout {
  userId: string;
  tabs: TabConfig[];
}
```

- [ ] **Step 2: Add panelLayout store to database**

In `src/db/database.ts`, add the table declaration:
```typescript
  panelLayout!: Table<PanelLayout>;
```

Add the import for PanelLayout:
```typescript
import type { IncomeRecord, UserSettings, ContentDailyRecord, RealtimeAggrRecord, PanelLayout } from '@/shared/types';
```

If Batch 2 already created v7 (with incomeGoals), add v8:
```typescript
    this.version(8).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
      panelLayout: 'userId',
    });
```

If v7 has NOT been created yet (incomeGoals and panelLayout added together), combine them into v7.

- [ ] **Step 3: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/db/database.ts
git commit -m "feat: add PanelLayout types and DB store"
```

---

### Task 3: Panel Registry

**Files:**
- Create: `src/dashboard/panel-registry.ts`

- [ ] **Step 1: Create the panel registry**

Create `src/dashboard/panel-registry.ts`:

```typescript
import React from 'react';
import type { DailySummary, IncomeRecord, TabConfig } from '@/shared/types';
import type { ContentTableItem } from './components/ContentTable';

// Lazy imports to avoid circular dependencies
const DailyTrendChart = React.lazy(() => import('./components/DailyTrendChart').then(m => ({ default: m.DailyTrendChart })));
const RPMForecastPanel = React.lazy(() => import('./components/RPMForecastPanel').then(m => ({ default: m.RPMForecastPanel })));
const WeeklySeasonalityChart = React.lazy(() => import('./components/WeeklySeasonalityChart').then(m => ({ default: m.WeeklySeasonalityChart })));
const AnomalyDetectionPanel = React.lazy(() => import('./components/AnomalyDetectionPanel').then(m => ({ default: m.AnomalyDetectionPanel })));
const ContentTypeComparisonPanel = React.lazy(() => import('./components/ContentTypeComparisonPanel').then(m => ({ default: m.ContentTypeComparisonPanel })));
const PublishTimeAnalysis = React.lazy(() => import('./components/PublishTimeAnalysis').then(m => ({ default: m.PublishTimeAnalysis })));
const MultiDimensionRanking = React.lazy(() => import('./components/MultiDimensionRanking').then(m => ({ default: m.MultiDimensionRanking })));
const IncomeGoalPanel = React.lazy(() => import('./components/IncomeGoalPanel').then(m => ({ default: m.IncomeGoalPanel })));
const MLPredictionPanel = React.lazy(() => import('./components/MLPredictionPanel').then(m => ({ default: m.MLPredictionPanel })));
const UnmonetizedContentPanel = React.lazy(() => import('./components/UnmonetizedContentPanel').then(m => ({ default: m.UnmonetizedContentPanel })));

/** All data that panels might need */
export interface DashboardContext {
  userId: string;
  allSummaries: DailySummary[];
  allDateRange: { start: string; end: string };
  allIncomeRecords: IncomeRecord[];
  records: IncomeRecord[]; // date-filtered
  monetizedContentIds: Set<string>;
  // Goal panel props
  monthIncome: number;
  monthDaysElapsed: number;
  monthDaysTotal: number;
  // Callbacks
  onContentClick: (item: ContentTableItem) => void;
}

export interface PanelMeta {
  key: string;
  label: string;
  tab: string;
  defaultOrder: number;
  defaultVisible: boolean;
  render: (ctx: DashboardContext) => React.ReactNode;
}

const panelRegistry: PanelMeta[] = [
  // --- Overview Tab ---
  {
    key: 'incomeGoal',
    label: '收益目标',
    tab: 'overview',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(IncomeGoalPanel, {
        userId: ctx.userId,
        monthIncome: ctx.monthIncome,
        monthDaysElapsed: ctx.monthDaysElapsed,
        monthDaysTotal: ctx.monthDaysTotal,
      }),
    ),
  },
  {
    key: 'dailyTrend',
    label: '日趋势图',
    tab: 'overview',
    defaultOrder: 1,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(DailyTrendChart, {
        summaries: ctx.allSummaries,
        startDate: ctx.allDateRange.start,
        endDate: ctx.allDateRange.end,
      }),
    ),
  },
  {
    key: 'contentTypeComparison',
    label: '文章vs回答',
    tab: 'overview',
    defaultOrder: 2,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(ContentTypeComparisonPanel, { records: ctx.allIncomeRecords }),
    ),
  },
  {
    key: 'rpm',
    label: 'RPM分析',
    tab: 'overview',
    defaultOrder: 3,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(RPMForecastPanel, {
        summaries: ctx.allSummaries,
        startDate: ctx.allDateRange.start,
        endDate: ctx.allDateRange.end,
      }),
    ),
  },
  {
    key: 'weeklySeasonality',
    label: '周期性分析',
    tab: 'overview',
    defaultOrder: 4,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(WeeklySeasonalityChart, { summaries: ctx.allSummaries }),
    ),
  },
  {
    key: 'publishTimeAnalysis',
    label: '发布时间分析',
    tab: 'overview',
    defaultOrder: 5,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(PublishTimeAnalysis, { records: ctx.allIncomeRecords }),
    ),
  },
  {
    key: 'multiDimensionRanking',
    label: '多维度排行',
    tab: 'overview',
    defaultOrder: 6,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(MultiDimensionRanking, {
        records: ctx.allIncomeRecords,
        onContentClick: (item: any) => ctx.onContentClick({
          ...item, currentIncome: 0, currentRead: 0, currentInteraction: 0,
        }),
      }),
    ),
  },
  {
    key: 'anomalyDetection',
    label: '异常检测',
    tab: 'overview',
    defaultOrder: 7,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(AnomalyDetectionPanel, {
        summaries: ctx.allSummaries,
        startDate: ctx.allDateRange.start,
        endDate: ctx.allDateRange.end,
      }),
    ),
  },
  // --- ML Tab ---
  {
    key: 'mlPrediction',
    label: '智能分析',
    tab: 'ml',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(MLPredictionPanel, { records: ctx.records }),
    ),
  },
  // --- Unmonetized Tab ---
  {
    key: 'unmonetizedContent',
    label: '未产生收益',
    tab: 'unmonetized',
    defaultOrder: 0,
    defaultVisible: true,
    render: (ctx) => React.createElement(React.Suspense, { fallback: null },
      React.createElement(UnmonetizedContentPanel, { monetizedContentIds: ctx.monetizedContentIds }),
    ),
  },
];

export function getPanelRegistry(): PanelMeta[] {
  return panelRegistry;
}

export function getPanelsByTab(tab: string): PanelMeta[] {
  return panelRegistry.filter(p => p.tab === tab);
}

export function getDefaultTabs(): TabConfig[] {
  const tabOrder: { key: string; label: string }[] = [
    { key: 'overview', label: '总览' },
    { key: 'ml', label: '智能分析' },
    { key: 'unmonetized', label: '未产生收益' },
    { key: 'content', label: '内容明细' },
  ];

  return tabOrder.map((t, idx) => ({
    key: t.key,
    label: t.label,
    visible: true,
    order: idx,
    panels: getPanelsByTab(t.key).map(p => ({
      key: p.key,
      visible: p.defaultVisible,
      order: p.defaultOrder,
    })),
  }));
}

export function getPanelMeta(key: string): PanelMeta | undefined {
  return panelRegistry.find(p => p.key === key);
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/panel-registry.ts
git commit -m "feat: create panel registry with all dashboard panels"
```

---

### Task 4: usePanelLayout Hook

**Files:**
- Create: `src/hooks/use-panel-layout.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/use-panel-layout.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/db/database';
import { getDefaultTabs } from '@/dashboard/panel-registry';
import type { PanelLayout, TabConfig } from '@/shared/types';

export function usePanelLayout(userId: string) {
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLayout = useCallback(async () => {
    if (!userId) {
      setLayout(null);
      setLoading(false);
      return;
    }

    const saved = await db.panelLayout.get(userId);
    if (saved) {
      // Merge with defaults: add any new panels/tabs from registry that aren't in saved layout
      const defaults = getDefaultTabs();
      const merged = mergeWithDefaults(saved.tabs, defaults);
      setLayout({ userId, tabs: merged });
    } else {
      setLayout({ userId, tabs: getDefaultTabs() });
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadLayout(); }, [loadLayout]);

  const updateLayout = useCallback((tabs: TabConfig[]) => {
    if (!userId) return;
    const newLayout: PanelLayout = { userId, tabs };
    setLayout(newLayout);

    // Debounced save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      db.panelLayout.put(newLayout);
    }, 500);
  }, [userId]);

  const resetLayout = useCallback(async () => {
    if (!userId) return;
    const defaults: PanelLayout = { userId, tabs: getDefaultTabs() };
    setLayout(defaults);
    await db.panelLayout.put(defaults);
  }, [userId]);

  return { layout, loading, updateLayout, resetLayout };
}

/**
 * Merge saved layout with registry defaults.
 * - Keep saved tab/panel order and visibility
 * - Add any new tabs/panels from defaults that aren't in saved
 * - Remove tabs/panels that no longer exist in defaults
 */
function mergeWithDefaults(saved: TabConfig[], defaults: TabConfig[]): TabConfig[] {
  const defaultTabMap = new Map(defaults.map(t => [t.key, t]));
  const savedTabKeys = new Set(saved.map(t => t.key));

  // Update existing saved tabs
  const merged = saved
    .filter(t => defaultTabMap.has(t.key)) // Remove tabs no longer in registry
    .map(savedTab => {
      const defaultTab = defaultTabMap.get(savedTab.key)!;
      const defaultPanelMap = new Map(defaultTab.panels.map(p => [p.key, p]));
      const savedPanelKeys = new Set(savedTab.panels.map(p => p.key));

      // Keep saved panels that still exist, add new ones
      const mergedPanels = [
        ...savedTab.panels.filter(p => defaultPanelMap.has(p.key)),
        ...defaultTab.panels.filter(p => !savedPanelKeys.has(p.key)),
      ];

      return { ...savedTab, panels: mergedPanels };
    });

  // Add new tabs from defaults
  for (const dt of defaults) {
    if (!savedTabKeys.has(dt.key)) {
      merged.push({ ...dt, order: merged.length });
    }
  }

  return merged;
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-panel-layout.ts
git commit -m "feat: add usePanelLayout hook with merge and persistence"
```

---

### Task 5: Layout Customizer Drawer

**Files:**
- Create: `src/dashboard/components/LayoutCustomizer.tsx`

- [ ] **Step 1: Create the LayoutCustomizer component**

Create `src/dashboard/components/LayoutCustomizer.tsx`:

```typescript
import React, { useState } from 'react';
import { Drawer, Switch, Button, Flex, Divider, Typography } from 'antd';
import { MenuOutlined, UndoOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabConfig, PanelConfig } from '@/shared/types';
import { getPanelMeta } from '@/dashboard/panel-registry';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  tabs: TabConfig[];
  onUpdate: (tabs: TabConfig[]) => void;
  onReset: () => void;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Flex align="center" gap={8} style={{ padding: '6px 0' }}>
        <MenuOutlined {...listeners} style={{ cursor: 'grab', color: '#999' }} />
        {children}
      </Flex>
    </div>
  );
}

export function LayoutCustomizer({ open, onClose, tabs, onUpdate, onReset }: Props) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedTabs.findIndex(t => t.key === active.id);
    const newIndex = sortedTabs.findIndex(t => t.key === over.id);
    const reordered = arrayMove(sortedTabs, oldIndex, newIndex).map((t, i) => ({ ...t, order: i }));
    onUpdate(reordered);
  };

  const handleTabVisibility = (tabKey: string, visible: boolean) => {
    onUpdate(tabs.map(t => t.key === tabKey ? { ...t, visible } : t));
  };

  const handlePanelDragEnd = (tabKey: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    onUpdate(tabs.map(t => {
      if (t.key !== tabKey) return t;
      const sortedPanels = [...t.panels].sort((a, b) => a.order - b.order);
      const oldIndex = sortedPanels.findIndex(p => p.key === active.id);
      const newIndex = sortedPanels.findIndex(p => p.key === over.id);
      const reordered = arrayMove(sortedPanels, oldIndex, newIndex).map((p, i) => ({ ...p, order: i }));
      return { ...t, panels: reordered };
    }));
  };

  const handlePanelVisibility = (tabKey: string, panelKey: string, visible: boolean) => {
    onUpdate(tabs.map(t => {
      if (t.key !== tabKey) return t;
      return {
        ...t,
        panels: t.panels.map(p => p.key === panelKey ? { ...p, visible } : p),
      };
    }));
  };

  return (
    <Drawer
      title="自定义布局"
      open={open}
      onClose={onClose}
      width={360}
      footer={
        <Flex justify="center">
          <Button icon={<UndoOutlined />} onClick={onReset}>恢复默认</Button>
        </Flex>
      }
    >
      <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: 'block' }}>
        拖拽调整顺序，开关控制显示/隐藏
      </Text>

      <Divider orientation="left" plain style={{ fontSize: 12 }}>标签页</Divider>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
        <SortableContext items={sortedTabs.map(t => t.key)} strategy={verticalListSortingStrategy}>
          {sortedTabs.map(tab => (
            <SortableItem key={tab.key} id={tab.key}>
              <Flex justify="space-between" align="center" style={{ flex: 1 }}>
                <span
                  style={{ cursor: 'pointer', fontWeight: expandedTab === tab.key ? 600 : 400 }}
                  onClick={() => setExpandedTab(expandedTab === tab.key ? null : tab.key)}
                >
                  {tab.label}
                </span>
                <Switch
                  size="small"
                  checked={tab.visible}
                  onChange={(checked) => handleTabVisibility(tab.key, checked)}
                />
              </Flex>
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>

      {expandedTab && (() => {
        const tab = tabs.find(t => t.key === expandedTab);
        if (!tab || tab.panels.length === 0) return null;
        const sortedPanels = [...tab.panels].sort((a, b) => a.order - b.order);

        return (
          <>
            <Divider orientation="left" plain style={{ fontSize: 12 }}>
              「{tab.label}」内面板
            </Divider>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handlePanelDragEnd(expandedTab, e)}
            >
              <SortableContext items={sortedPanels.map(p => p.key)} strategy={verticalListSortingStrategy}>
                {sortedPanels.map(panel => {
                  const meta = getPanelMeta(panel.key);
                  return (
                    <SortableItem key={panel.key} id={panel.key}>
                      <Flex justify="space-between" align="center" style={{ flex: 1 }}>
                        <span style={{ fontSize: 13 }}>{meta?.label ?? panel.key}</span>
                        <Switch
                          size="small"
                          checked={panel.visible}
                          onChange={(checked) => handlePanelVisibility(expandedTab, panel.key, checked)}
                        />
                      </Flex>
                    </SortableItem>
                  );
                })}
              </SortableContext>
            </DndContext>
          </>
        );
      })()}
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/components/LayoutCustomizer.tsx
git commit -m "feat: add LayoutCustomizer drawer with drag-and-drop"
```

---

### Task 6: Refactor Dashboard to Registry-Driven Rendering

**Files:**
- Modify: `src/dashboard/Dashboard.tsx`

This is the largest task. Dashboard.tsx needs to:
1. Use `usePanelLayout` hook
2. Build `DashboardContext`
3. Render tabs and panels from layout config + registry
4. Keep the "content" tab as special (it has its own RangePicker and ContentTable which aren't in the registry)
5. Add LayoutCustomizer entry in settings dropdown

- [ ] **Step 1: Add new imports to Dashboard**

Add these imports to `src/dashboard/Dashboard.tsx`:

```typescript
import { usePanelLayout } from '@/hooks/use-panel-layout';
import { getPanelMeta, type DashboardContext } from '@/dashboard/panel-registry';
import { LayoutCustomizer } from './components/LayoutCustomizer';
```

Remove the individual panel component imports that are now handled by the registry:
```typescript
// Remove these imports (they're now in panel-registry.ts via lazy loading):
// import { DailyTrendChart } from './components/DailyTrendChart';
// import { RPMForecastPanel } from './components/RPMForecastPanel';
// import { WeeklySeasonalityChart } from './components/WeeklySeasonalityChart';
// import { MLPredictionPanel } from './components/MLPredictionPanel';
// import { AnomalyDetectionPanel } from './components/AnomalyDetectionPanel';
// import { UnmonetizedContentPanel } from './components/UnmonetizedContentPanel';
// import { ContentTypeComparisonPanel } from './components/ContentTypeComparisonPanel';
// import { PublishTimeAnalysis } from './components/PublishTimeAnalysis';
// import { MultiDimensionRanking } from './components/MultiDimensionRanking';
// import { IncomeGoalPanel } from './components/IncomeGoalPanel';
```

Keep imports for components that are NOT in the registry:
```typescript
import { ContentTable, type ContentTableItem } from './components/ContentTable';
import { ContentDetailPage } from './components/ContentDetailPage';
```

- [ ] **Step 2: Add layout hook and customizer state**

Inside the `Dashboard` component, add:

```typescript
  const { layout, loading: layoutLoading, updateLayout, resetLayout } = usePanelLayout(user?.id ?? '');
  const [customizerOpen, setCustomizerOpen] = useState(false);
```

- [ ] **Step 3: Build DashboardContext**

Add after the `stats` useMemo:

```typescript
  const dashboardContext: DashboardContext | null = useMemo(() => {
    if (!user) return null;
    return {
      userId: user.id,
      allSummaries,
      allDateRange,
      allIncomeRecords,
      records,
      monetizedContentIds,
      monthIncome: stats.monthIncome,
      monthDaysElapsed: stats.monthDaysElapsed,
      monthDaysTotal: stats.monthDaysTotal,
      onContentClick: (item: ContentTableItem) => setSelectedContent(item),
    };
  }, [user, allSummaries, allDateRange, allIncomeRecords, records, monetizedContentIds, stats]);
```

- [ ] **Step 4: Add "自定义布局" to settings dropdown**

In the settings dropdown items, add:
```typescript
                  {
                    key: 'layout',
                    icon: <SettingOutlined />,
                    label: '自定义布局',
                    onClick: () => setCustomizerOpen(true),
                  },
```

- [ ] **Step 5: Replace hardcoded Tabs with registry-driven rendering**

Replace the entire `<Tabs>` component (from `<Tabs defaultActiveKey="overview"` to the closing `/>`) with:

```typescript
            <Tabs
              defaultActiveKey="overview"
              type="card"
              items={
                layout
                  ? [...layout.tabs]
                      .filter(t => t.visible)
                      .sort((a, b) => a.order - b.order)
                      .map(tab => {
                        // Special case: content tab has its own UI
                        if (tab.key === 'content') {
                          return {
                            key: 'content',
                            label: `${tab.label} (${totalContentCount})`,
                            children: (
                              <Flex vertical gap={12}>
                                <Flex justify="flex-end">
                                  <RangePicker
                                    value={[dayjs(startDate), dayjs(endDate)]}
                                    onChange={handleRangeChange}
                                    presets={Object.entries(quickRanges).map(([label, value]) => ({ label, value }))}
                                    allowClear={false}
                                    size="small"
                                  />
                                </Flex>
                                <ContentTable
                                  records={records}
                                  onContentClick={setSelectedContent}
                                  onCompare={(items) => setCompareItems(items)}
                                />
                              </Flex>
                            ),
                          };
                        }

                        // Registry-driven tabs
                        const visiblePanels = [...tab.panels]
                          .filter(p => p.visible)
                          .sort((a, b) => a.order - b.order);

                        return {
                          key: tab.key,
                          label: tab.label,
                          children: allSummaries.length === 0 && tab.key === 'overview' ? (
                            <Empty description="暂无数据" />
                          ) : dashboardContext ? (
                            <Flex vertical gap={24}>
                              {visiblePanels.map(panelConfig => {
                                const meta = getPanelMeta(panelConfig.key);
                                if (!meta) return null;
                                return (
                                  <React.Fragment key={panelConfig.key}>
                                    {meta.render(dashboardContext)}
                                  </React.Fragment>
                                );
                              })}
                            </Flex>
                          ) : null,
                        };
                      })
                  : []
              }
            />
```

- [ ] **Step 6: Add LayoutCustomizer drawer to JSX**

Before `</Content>`, add:

```typescript
        {layout && (
          <LayoutCustomizer
            open={customizerOpen}
            onClose={() => setCustomizerOpen(false)}
            tabs={layout.tabs}
            onUpdate={updateLayout}
            onReset={() => { resetLayout(); setCustomizerOpen(false); }}
          />
        )}
```

- [ ] **Step 7: Verify build passes**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/dashboard/Dashboard.tsx
git commit -m "refactor: convert Dashboard to registry-driven panel rendering with customization"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vite build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run existing tests**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx vitest run 2>&1 | tail -15`
Expected: All existing tests pass

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors (or only pre-existing ones)
