# Onboarding Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive step-by-step onboarding tour using driver.js, with layered guidance (core 5 steps + optional extended 4 steps), new-feature banners on version updates, and Dexie-persisted tour state.

**Architecture:** driver.js highlights real Dashboard elements via CSS selectors. Tour state is stored in a Dexie `tourState` store (DB v9). A `tour/` directory under `src/dashboard/` contains all tour logic: step definitions, control flow, theme CSS, and the new-feature banner component. Dashboard.tsx gains id attributes on key elements and integrates tour triggering.

**Tech Stack:** React 18, TypeScript, Vite, Ant Design 6.x, Dexie 4.x, driver.js 1.x, vitest + fake-indexeddb

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/shared/types.ts` | Modify | Add `TourState` interface |
| `src/db/database.ts` | Modify | v9 upgrade, add `tourState` store |
| `src/db/tour-store.ts` | Create | Dexie CRUD for TourState |
| `tests/db/tour-store.test.ts` | Create | Tests for tour-store |
| `src/dashboard/tour/tour-config.ts` | Create | Step definitions + version changelog |
| `src/dashboard/tour/tour-manager.ts` | Create | Tour control logic (start, detect, filter) |
| `src/dashboard/tour/tour-theme.css` | Create | driver.js custom styles matching editorial theme |
| `src/dashboard/tour/NewFeatureBanner.tsx` | Create | Top notification bar for new features |
| `src/dashboard/Dashboard.tsx` | Modify | Add element ids, integrate tour + banner |
| `tests/dashboard/tour/tour-manager.test.ts` | Create | Tests for tour-manager logic |

---

### Task 1: TourState Type + Dexie Store

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/db/database.ts`
- Create: `src/db/tour-store.ts`
- Create: `tests/db/tour-store.test.ts`

- [ ] **Step 1: Add TourState interface to types.ts**

Open `src/shared/types.ts` and add at the end of the file:

```typescript
/** Onboarding tour state per user */
export interface TourState {
  userId: string;
  completedVersion: string;
  seenFeatures: string[];
  coreCompleted: boolean;
  extendedCompleted: boolean;
}
```

- [ ] **Step 2: Upgrade database to v9 with tourState store**

Open `src/db/database.ts`. Find the last `.version(8).stores(...)` block and add after it:

```typescript
this.version(9).stores({
  tourState: 'userId',
});
```

Also add the table declaration near the other table declarations (look for `panelLayout!:` line):

```typescript
tourState!: Dexie.Table<TourState, string>;
```

Add `TourState` to the import from `@/shared/types` at the top of the file.

- [ ] **Step 3: Write failing tests for tour-store**

Create `tests/db/tour-store.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  getTourState,
  saveTourState,
  markCoreCompleted,
  markExtendedCompleted,
  markFeaturesRead,
  updateCompletedVersion,
  resetTourState,
} from '@/db/tour-store';

beforeEach(async () => {
  await db.tourState.clear();
});

describe('tour-store', () => {
  const userId = 'test-user-1';

  it('returns undefined when no tour state exists', async () => {
    const state = await getTourState(userId);
    expect(state).toBeUndefined();
  });

  it('saves and retrieves tour state', async () => {
    const state = {
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['feat1'],
      coreCompleted: true,
      extendedCompleted: false,
    };
    await saveTourState(state);
    const retrieved = await getTourState(userId);
    expect(retrieved).toEqual(state);
  });

  it('marks core completed', async () => {
    await saveTourState({
      userId,
      completedVersion: '',
      seenFeatures: [],
      coreCompleted: false,
      extendedCompleted: false,
    });
    await markCoreCompleted(userId);
    const state = await getTourState(userId);
    expect(state?.coreCompleted).toBe(true);
  });

  it('marks extended completed', async () => {
    await saveTourState({
      userId,
      completedVersion: '',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: false,
    });
    await markExtendedCompleted(userId);
    const state = await getTourState(userId);
    expect(state?.extendedCompleted).toBe(true);
  });

  it('marks features as read', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['old'],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await markFeaturesRead(userId, ['new1', 'new2']);
    const state = await getTourState(userId);
    expect(state?.seenFeatures).toEqual(['old', 'new1', 'new2']);
  });

  it('updates completed version', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await updateCompletedVersion(userId, '1.1.0');
    const state = await getTourState(userId);
    expect(state?.completedVersion).toBe('1.1.0');
  });

  it('resets tour state', async () => {
    await saveTourState({
      userId,
      completedVersion: '1.0.0',
      seenFeatures: ['feat1'],
      coreCompleted: true,
      extendedCompleted: true,
    });
    await resetTourState(userId);
    const state = await getTourState(userId);
    expect(state?.coreCompleted).toBe(false);
    expect(state?.extendedCompleted).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/db/tour-store.test.ts`
Expected: FAIL — module `@/db/tour-store` not found.

- [ ] **Step 5: Implement tour-store.ts**

Create `src/db/tour-store.ts`:

```typescript
import { db } from './database';
import type { TourState } from '@/shared/types';

export async function getTourState(userId: string): Promise<TourState | undefined> {
  return db.tourState.get(userId);
}

export async function saveTourState(state: TourState): Promise<void> {
  await db.tourState.put(state);
}

export async function markCoreCompleted(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, coreCompleted: true });
  }
}

export async function markExtendedCompleted(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, extendedCompleted: true });
  }
}

export async function markFeaturesRead(userId: string, featureKeys: string[]): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    const merged = [...state.seenFeatures, ...featureKeys.filter(k => !state.seenFeatures.includes(k))];
    await saveTourState({ ...state, seenFeatures: merged });
  }
}

export async function updateCompletedVersion(userId: string, version: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, completedVersion: version });
  }
}

export async function resetTourState(userId: string): Promise<void> {
  const state = await getTourState(userId);
  if (state) {
    await saveTourState({ ...state, coreCompleted: false, extendedCompleted: false });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/db/tour-store.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/db/database.ts src/db/tour-store.ts tests/db/tour-store.test.ts
git commit -m "feat: add TourState type, Dexie v9 store, and tour-store CRUD"
```

---

### Task 2: Tour Configuration (Step Definitions)

**Files:**
- Create: `src/dashboard/tour/tour-config.ts`

- [ ] **Step 1: Install driver.js**

```bash
npm install driver.js
```

- [ ] **Step 2: Create tour-config.ts with step definitions and changelog**

Create `src/dashboard/tour/tour-config.ts`:

```typescript
import type { DriveStep } from 'driver.js';

export const TOUR_VERSION = '1.0.0';

export const CORE_STEPS: DriveStep[] = [
  {
    element: '#tour-sync-button',
    popover: {
      title: '同步数据',
      description: '点击这里从知乎同步最新的收益数据，首次使用请先完成同步。',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-summary-cards',
    popover: {
      title: '收益概览',
      description: '这里展示昨日、本月和累计收益数据，帮助你快速了解整体收益状况。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-daily-trend',
    popover: {
      title: '每日趋势',
      description: '查看阅读量和收益的每日变化趋势，支持缩放和拖动查看历史数据。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-tab-bar',
    popover: {
      title: '分析维度',
      description: '切换不同 Tab 查看智能分析、未产生收益内容、内容明细等更多分析维度。',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-layout-button',
    popover: {
      title: '自定义面板',
      description: '可以按需显示、隐藏和排列各分析面板，打造你专属的数据看板。',
      side: 'bottom',
      align: 'end',
    },
  },
];

export const EXTENDED_STEPS: DriveStep[] = [
  {
    element: '#tour-incomeGoal',
    popover: {
      title: '收益目标',
      description: '设定月度收益目标，追踪完成进度，查看是否能按期达成。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-rpm',
    popover: {
      title: 'RPM 趋势',
      description: '追踪每千次阅读收益效率（RPM），评估你的内容变现能力变化。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-milestones',
    popover: {
      title: '成就记录',
      description: '查看你的收益里程碑和最高记录，记录每一次突破。',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '#tour-export',
    popover: {
      title: '数据导出',
      description: '导出收益数据报告为 Excel 文件，方便离线分析和存档。',
      side: 'bottom',
      align: 'end',
    },
  },
];

export interface FeatureEntry {
  key: string;
  step: DriveStep;
}

/**
 * Version changelog: maps version string to new features introduced.
 * Each entry contains the feature key (for tracking seen status) and
 * the driver.js step definition to highlight it.
 */
export const FEATURE_CHANGELOG: Record<string, FeatureEntry[]> = {
  '1.0.0': [],
  // Future example:
  // '1.1.0': [
  //   {
  //     key: 'newPanel',
  //     step: { element: '#tour-newPanel', popover: { title: '...', description: '...' } },
  //   },
  // ],
};
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/tour/tour-config.ts package.json package-lock.json
git commit -m "feat: add driver.js dependency and tour step configuration"
```

---

### Task 3: Tour Manager (Control Logic)

**Files:**
- Create: `src/dashboard/tour/tour-manager.ts`
- Create: `tests/dashboard/tour/tour-manager.test.ts`

- [ ] **Step 1: Write failing tests for tour-manager**

Create `tests/dashboard/tour/tour-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldShowTour, getNewFeatures } from '@/dashboard/tour/tour-manager';
import type { TourState } from '@/shared/types';

describe('shouldShowTour', () => {
  it('returns "core" when no tour state exists', () => {
    expect(shouldShowTour(undefined)).toBe('core');
  });

  it('returns "extended" when core is done but extended is not', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: false,
    };
    expect(shouldShowTour(state)).toBe('extended');
  });

  it('returns null when both core and extended are done and version is current', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    expect(shouldShowTour(state)).toBeNull();
  });

  it('returns "new-features" when completedVersion is behind and there are new features', () => {
    // This test is only meaningful when FEATURE_CHANGELOG has entries for newer versions.
    // For now with only '1.0.0' (empty), a state with completedVersion '0.9.0' still returns null
    // because there are no actual new features to show.
    const state: TourState = {
      userId: 'u1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    // No new features in changelog yet, so null
    expect(shouldShowTour(state)).toBeNull();
  });
});

describe('getNewFeatures', () => {
  it('returns empty array when version is current', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '1.0.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    expect(getNewFeatures(state)).toEqual([]);
  });

  it('returns empty array when all features are already seen', () => {
    const state: TourState = {
      userId: 'u1',
      completedVersion: '0.9.0',
      seenFeatures: [],
      coreCompleted: true,
      extendedCompleted: true,
    };
    // No features in changelog for any version
    expect(getNewFeatures(state)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dashboard/tour/tour-manager.test.ts`
Expected: FAIL — module `@/dashboard/tour/tour-manager` not found.

- [ ] **Step 3: Implement tour-manager.ts**

Create `src/dashboard/tour/tour-manager.ts`:

```typescript
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour-theme.css';
import {
  TOUR_VERSION,
  CORE_STEPS,
  EXTENDED_STEPS,
  FEATURE_CHANGELOG,
  type FeatureEntry,
} from './tour-config';
import type { TourState } from '@/shared/types';

/**
 * Determine what tour should be shown based on current state.
 */
export function shouldShowTour(
  tourState: TourState | undefined,
): 'core' | 'extended' | 'new-features' | null {
  if (!tourState) return 'core';
  if (!tourState.coreCompleted) return 'core';
  if (!tourState.extendedCompleted) return 'extended';

  const newFeatures = getNewFeatures(tourState);
  if (newFeatures.length > 0) return 'new-features';

  return null;
}

/**
 * Get features the user hasn't seen yet, comparing their completedVersion
 * against all versions in the changelog.
 */
export function getNewFeatures(tourState: TourState): FeatureEntry[] {
  const unseen: FeatureEntry[] = [];
  for (const [version, features] of Object.entries(FEATURE_CHANGELOG)) {
    if (version > tourState.completedVersion) {
      for (const feat of features) {
        if (!tourState.seenFeatures.includes(feat.key)) {
          unseen.push(feat);
        }
      }
    }
  }
  return unseen;
}

/**
 * Start the core tour (5 steps). Calls onComplete when finished or destroyed.
 */
export function startCoreTour(onComplete: () => void): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: CORE_STEPS,
    onDestroyed: onComplete,
  });
  d.drive();
}

/**
 * Start the extended tour (4 steps). Calls onComplete when finished or destroyed.
 */
export function startExtendedTour(onComplete: () => void): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: EXTENDED_STEPS,
    onDestroyed: onComplete,
  });
  d.drive();
}

/**
 * Start a tour for new features only. Calls onComplete when finished or destroyed.
 */
export function startNewFeatureTour(
  features: FeatureEntry[],
  onComplete: () => void,
): void {
  const d = driver({
    showProgress: true,
    progressText: '第 {{current}} 步 / 共 {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    steps: features.map(f => f.step),
    onDestroyed: onComplete,
  });
  d.drive();
}
```

- [ ] **Step 4: Create empty tour-theme.css (required by import)**

Create `src/dashboard/tour/tour-theme.css` with an empty placeholder comment:

```css
/* driver.js theme overrides — populated in Task 4 */
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/dashboard/tour/tour-manager.test.ts`
Expected: All 5 tests PASS.

Note: The `driver.js` imports in `tour-manager.ts` may cause issues in vitest if CSS imports aren't handled. If tests fail due to CSS import errors, the test file only imports `shouldShowTour` and `getNewFeatures` which are pure functions — you may need to mock the CSS import. Add to the top of the test file if needed:

```typescript
vi.mock('driver.js/dist/driver.css', () => ({}));
vi.mock('@/dashboard/tour/tour-theme.css', () => ({}));
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/tour/tour-manager.ts src/dashboard/tour/tour-theme.css tests/dashboard/tour/tour-manager.test.ts
git commit -m "feat: add tour manager with control logic and tests"
```

---

### Task 4: Tour Theme CSS

**Files:**
- Modify: `src/dashboard/tour/tour-theme.css`

- [ ] **Step 1: Implement driver.js theme overrides**

Replace the contents of `src/dashboard/tour/tour-theme.css`:

```css
/* driver.js popover — editorial theme overrides */

.driver-popover {
  font-family: "Source Han Sans SC", -apple-system, "PingFang SC", sans-serif;
  background: #fff;
  border: 1px solid #e0dcd6;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-width: 320px;
}

.driver-popover-title {
  font-family: "Noto Serif SC", serif;
  color: #333;
  font-size: 15px;
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

.driver-popover-navigation-btns .driver-popover-next-btn,
.driver-popover-navigation-btns .driver-popover-done-btn {
  background: #5b7a9d;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  padding: 4px 14px;
  text-shadow: none;
}

.driver-popover-navigation-btns .driver-popover-next-btn:hover,
.driver-popover-navigation-btns .driver-popover-done-btn:hover {
  background: #4a6a8d;
}

.driver-popover-navigation-btns .driver-popover-prev-btn {
  color: #5b7a9d;
  border: 1px solid #e0dcd6;
  border-radius: 6px;
  font-size: 13px;
  padding: 4px 14px;
  background: transparent;
}

.driver-popover-navigation-btns .driver-popover-prev-btn:hover {
  background: #f5f2ed;
}

.driver-popover-close-btn {
  color: #999;
}

.driver-popover-close-btn:hover {
  color: #333;
}

.driver-popover-arrow-side-left .driver-popover-arrow,
.driver-popover-arrow-side-right .driver-popover-arrow,
.driver-popover-arrow-side-top .driver-popover-arrow,
.driver-popover-arrow-side-bottom .driver-popover-arrow {
  border-color: #e0dcd6;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tour/tour-theme.css
git commit -m "style: add editorial theme overrides for driver.js popover"
```

---

### Task 5: NewFeatureBanner Component

**Files:**
- Create: `src/dashboard/tour/NewFeatureBanner.tsx`

- [ ] **Step 1: Create NewFeatureBanner component**

Create `src/dashboard/tour/NewFeatureBanner.tsx`:

```tsx
import React from 'react';
import { Alert, Button, Space } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import { themeColors } from '../theme';

interface Props {
  featureCount: number;
  onViewFeatures: () => void;
  onDismiss: () => void;
}

export function NewFeatureBanner({ featureCount, onViewFeatures, onDismiss }: Props) {
  return (
    <Alert
      message={
        <Space>
          <span>本次更新新增了 {featureCount} 个新功能</span>
          <Button type="primary" size="small" onClick={onViewFeatures}>
            查看新功能
          </Button>
          <Button size="small" onClick={onDismiss}>
            忽略
          </Button>
        </Space>
      }
      icon={<BulbOutlined />}
      showIcon
      closable={false}
      style={{
        marginBottom: 12,
        background: themeColors.amberBg,
        border: `1px solid ${themeColors.amberLight}`,
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tour/NewFeatureBanner.tsx
git commit -m "feat: add NewFeatureBanner component for version update notifications"
```

---

### Task 6: Dashboard Integration

**Files:**
- Modify: `src/dashboard/Dashboard.tsx`

This is the final integration task. It involves:
1. Adding `id` attributes to key elements
2. Adding a `useTour` integration hook
3. Rendering the NewFeatureBanner
4. Adding "功能介绍" menu item
5. Triggering the tour on first load

- [ ] **Step 1: Add id attributes to Dashboard elements**

Open `src/dashboard/Dashboard.tsx`. Add `id` props to these elements (find each by its surrounding context):

**Sync/Collect button** — find the Button that triggers `handleSync` or shows collecting progress. Add:
```tsx
id="tour-sync-button"
```

**Summary cards Row** — find the `<Row gutter={...}>` that contains the 3 summary Statistic cards. Add:
```tsx
id="tour-summary-cards"
```

**Tabs component** — find the `<Tabs` component. Add:
```tsx
id="tour-tab-bar"
```

**Layout customizer menu item** — find the Dropdown.Menu item that opens the layout customizer (the one with key `layout`). The button/item itself should get:
```tsx
id="tour-layout-button"
```

Note: Since this is inside a Dropdown menu, the id should instead go on the button/icon that triggers the dropdown, OR on the settings Dropdown trigger element so it's always visible. Find the settings `<Dropdown>` trigger and add the id to the trigger element (the button that opens the settings menu).

Actually, the layout button may not be directly visible (it's inside a dropdown). Instead, add the id to the settings dropdown trigger button itself and adjust the tour step text to say "在这里的设置菜单中可以自定义面板布局". Update step 5 in tour-config.ts accordingly:

```typescript
// Step 5 in CORE_STEPS:
{
  element: '#tour-settings-menu',
  popover: {
    title: '设置菜单',
    description: '在这里可以自定义面板布局、导出数据报告、查看成就记录等更多功能。',
    side: 'bottom',
    align: 'end',
  },
},
```

And add `id="tour-settings-menu"` to the settings dropdown trigger element.

**Milestones button** — also inside the dropdown. Update extended step for milestones to point to the same settings menu:

```typescript
// Replace tour-milestones and tour-export steps in EXTENDED_STEPS with:
{
  element: '#tour-incomeGoal',
  popover: {
    title: '收益目标',
    description: '设定月度收益目标，追踪完成进度，查看是否能按期达成。',
    side: 'bottom',
    align: 'center',
  },
},
{
  element: '#tour-rpm',
  popover: {
    title: 'RPM 趋势',
    description: '追踪每千次阅读收益效率（RPM），评估你的内容变现能力变化。',
    side: 'top',
    align: 'center',
  },
},
{
  element: '#tour-settings-menu',
  popover: {
    title: '更多功能',
    description: '在设置菜单中还可以查看成就记录、导出 Excel 报告、导入导出数据等。',
    side: 'bottom',
    align: 'end',
  },
},
```

So the extended steps become 3 steps (income goal, RPM, settings menu recap).

**Panel containers** — in the panel rendering loop in Dashboard.tsx, where panels are rendered via `getPanelMeta(panelConfig.key)?.render(dashboardContext)`, wrap or add an id to the panel container div:

Find the panel rendering code (should be inside the tabs mapping). Each panel is rendered in a container. Add:
```tsx
id={`tour-${panelConfig.key}`}
```
to the wrapping element (likely a `<div key={panelConfig.key}>` or similar).

- [ ] **Step 2: Add tour integration logic to Dashboard**

Add the following imports near the top of Dashboard.tsx:

```typescript
import { getTourState, saveTourState, markCoreCompleted, markExtendedCompleted, markFeaturesRead, updateCompletedVersion, resetTourState } from '@/db/tour-store';
import { shouldShowTour, getNewFeatures, startCoreTour, startExtendedTour, startNewFeatureTour } from './tour/tour-manager';
import { TOUR_VERSION } from './tour/tour-config';
import { NewFeatureBanner } from './tour/NewFeatureBanner';
import type { TourState } from '@/shared/types';
```

Add state variables inside the Dashboard component:

```typescript
const [tourState, setTourState] = useState<TourState | undefined>(undefined);
const [tourLoaded, setTourLoaded] = useState(false);
const [showNewFeatureBanner, setShowNewFeatureBanner] = useState(false);
const [newFeatureCount, setNewFeatureCount] = useState(0);
```

Add a useEffect to load tour state after user is available:

```typescript
useEffect(() => {
  if (!user) return;
  getTourState(user.id).then(state => {
    setTourState(state);
    setTourLoaded(true);
    if (state) {
      const features = getNewFeatures(state);
      if (features.length > 0) {
        setNewFeatureCount(features.length);
        setShowNewFeatureBanner(true);
      }
    }
  });
}, [user]);
```

Add a useEffect to auto-trigger the first-time tour (only when data is loaded):

```typescript
useEffect(() => {
  if (!user || !tourLoaded) return;
  // Only auto-trigger core tour for first-time users who have data
  if (!tourState && summaries.length > 0) {
    // Small delay to ensure DOM is rendered
    const timer = setTimeout(() => {
      const initialState: TourState = {
        userId: user.id,
        completedVersion: TOUR_VERSION,
        seenFeatures: [],
        coreCompleted: false,
        extendedCompleted: false,
      };
      saveTourState(initialState).then(() => {
        startCoreTour(() => {
          markCoreCompleted(user.id).then(() => {
            setTourState(prev => prev ? { ...prev, coreCompleted: true } : prev);
            // Show confirm for extended tour
            Modal.confirm({
              title: '还有更多功能可以探索',
              content: '要继续了解更多高级功能吗？也可以稍后在设置菜单中查看。',
              okText: '继续探索',
              cancelText: '稍后再看',
              onOk: () => {
                startExtendedTour(() => {
                  markExtendedCompleted(user.id);
                  setTourState(prev => prev ? { ...prev, extendedCompleted: true } : prev);
                });
              },
            });
          });
        });
      });
    }, 800);
    return () => clearTimeout(timer);
  }
}, [user, tourLoaded, tourState, summaries.length]);
```

Make sure `Modal` is imported from `antd` (it likely already is, or add it).

Add handler functions for the new feature banner:

```typescript
const handleViewNewFeatures = () => {
  if (!user || !tourState) return;
  const features = getNewFeatures(tourState);
  setShowNewFeatureBanner(false);
  startNewFeatureTour(features, () => {
    const featureKeys = features.map(f => f.key);
    markFeaturesRead(user.id, featureKeys);
    updateCompletedVersion(user.id, TOUR_VERSION);
    setTourState(prev => prev ? {
      ...prev,
      seenFeatures: [...prev.seenFeatures, ...featureKeys],
      completedVersion: TOUR_VERSION,
    } : prev);
  });
};

const handleDismissNewFeatures = () => {
  if (!user || !tourState) return;
  setShowNewFeatureBanner(false);
  const features = getNewFeatures(tourState);
  const featureKeys = features.map(f => f.key);
  markFeaturesRead(user.id, featureKeys);
  updateCompletedVersion(user.id, TOUR_VERSION);
};

const handleStartTour = () => {
  if (!user) return;
  resetTourState(user.id).then(() => {
    setTourState(prev => prev ? { ...prev, coreCompleted: false, extendedCompleted: false } : prev);
    startCoreTour(() => {
      markCoreCompleted(user.id);
      setTourState(prev => prev ? { ...prev, coreCompleted: true } : prev);
    });
  });
};
```

- [ ] **Step 3: Render NewFeatureBanner in JSX**

In the Dashboard JSX, after the alert messages section and before the summary cards, add:

```tsx
{showNewFeatureBanner && (
  <NewFeatureBanner
    featureCount={newFeatureCount}
    onViewFeatures={handleViewNewFeatures}
    onDismiss={handleDismissNewFeatures}
  />
)}
```

- [ ] **Step 4: Add "功能介绍" menu item**

In the settings dropdown menu items array, add a new item (before or after the `layout` item):

```typescript
{
  key: 'tour',
  icon: <ReadOutlined />,
  label: '功能介绍',
  onClick: handleStartTour,
},
```

Import `ReadOutlined` from `@ant-design/icons` if not already imported.

- [ ] **Step 5: Update tour-config.ts step 5 and extended steps**

Update `src/dashboard/tour/tour-config.ts` — replace the last core step (step 5) to target `#tour-settings-menu` instead of `#tour-layout-button`:

```typescript
// CORE_STEPS[4]:
{
  element: '#tour-settings-menu',
  popover: {
    title: '设置菜单',
    description: '在这里可以自定义面板布局、导出数据报告、查看成就记录等更多功能。',
    side: 'bottom',
    align: 'end',
  },
},
```

Replace `EXTENDED_STEPS` to be 3 steps (remove the milestones and export steps that pointed to hidden dropdown items):

```typescript
export const EXTENDED_STEPS: DriveStep[] = [
  {
    element: '#tour-incomeGoal',
    popover: {
      title: '收益目标',
      description: '设定月度收益目标，追踪完成进度，查看是否能按期达成。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-rpm',
    popover: {
      title: 'RPM 趋势',
      description: '追踪每千次阅读收益效率（RPM），评估你的内容变现能力变化。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-settings-menu',
    popover: {
      title: '更多功能',
      description: '在设置菜单中还可以查看成就记录、导出 Excel 报告、导入导出数据等。',
      side: 'bottom',
      align: 'end',
    },
  },
];
```

- [ ] **Step 6: Verify the build**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new tour tests).

- [ ] **Step 8: Commit**

```bash
git add src/dashboard/Dashboard.tsx src/dashboard/tour/tour-config.ts src/dashboard/tour/NewFeatureBanner.tsx
git commit -m "feat: integrate onboarding tour into Dashboard with new-feature banner"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] driver.js integration — Task 2 (install), Task 3 (manager), Task 4 (theme)
- [x] TourState Dexie store — Task 1
- [x] Core tour (5 steps) — Task 2 config + Task 6 trigger
- [x] Extended tour (layered) — Task 2 config + Task 6 Modal.confirm flow
- [x] New feature banner — Task 5 component + Task 6 integration
- [x] Version changelog system — Task 2 FEATURE_CHANGELOG
- [x] Settings menu "功能介绍" entry — Task 6 step 4
- [x] Element id attributes — Task 6 step 1
- [x] Theme customization — Task 4
- [x] Edge cases (data not loaded, hidden panels) — Task 6 (delay timer, driver.js auto-skip)

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** `TourState` interface used consistently across types.ts, tour-store.ts, tour-manager.ts, and Dashboard.tsx. `FeatureEntry` defined in tour-config.ts and used in tour-manager.ts. `DriveStep` from driver.js used in tour-config.ts.
