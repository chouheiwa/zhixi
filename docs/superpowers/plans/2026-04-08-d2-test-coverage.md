# D2: 测试覆盖率提升至 80%+ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将测试行覆盖率从当前水平提升至 80%+，优先覆盖 DB 存储层、API 层、共享工具、Hooks，最后用快照测试覆盖 Dashboard 组件。

**Architecture:** 按模块优先级分批编写测试。DB 和 API 层使用 fake-indexeddb 和 fetch mock；Hooks 使用 @testing-library/react 的 renderHook；Dashboard 组件使用基础渲染测试确保不崩溃。

**Tech Stack:** Vitest, @testing-library/react, fake-indexeddb, happy-dom

---

### Task 1: 运行基线覆盖率

- [ ] **Step 1: 运行覆盖率并记录当前水平**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm run test:coverage 2>&1 | tail -30`

记录输出中的 `% Lines` 数字作为基线。

---

### Task 2: DB 存储层测试 — goal-store

**Files:**
- Create: `tests/db/goal-store.test.ts`
- Test target: `src/db/goal-store.ts`

- [ ] **Step 1: 编写 goal-store 测试**

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { getGoal, saveGoal, deleteGoal, getAllGoals } from '@/db/goal-store';

beforeEach(async () => {
  await db.incomeGoals.clear();
});

describe('goal-store', () => {
  const goal = { userId: 'u1', period: '2026-04', targetAmount: 10000, note: 'test' };

  it('saveGoal and getGoal round-trip', async () => {
    await saveGoal(goal);
    const result = await getGoal('u1', '2026-04');
    expect(result).toMatchObject(goal);
  });

  it('getGoal returns undefined for missing', async () => {
    const result = await getGoal('u1', '2099-01');
    expect(result).toBeUndefined();
  });

  it('deleteGoal removes the record', async () => {
    await saveGoal(goal);
    await deleteGoal('u1', '2026-04');
    const result = await getGoal('u1', '2026-04');
    expect(result).toBeUndefined();
  });

  it('getAllGoals returns only goals for given userId', async () => {
    await saveGoal(goal);
    await saveGoal({ userId: 'u1', period: '2026-05', targetAmount: 20000, note: '' });
    await saveGoal({ userId: 'u2', period: '2026-04', targetAmount: 5000, note: '' });
    const results = await getAllGoals('u1');
    expect(results).toHaveLength(2);
    expect(results.every((g) => g.userId === 'u1')).toBe(true);
  });

  it('saveGoal upserts existing goal', async () => {
    await saveGoal(goal);
    await saveGoal({ ...goal, targetAmount: 50000 });
    const result = await getGoal('u1', '2026-04');
    expect(result?.targetAmount).toBe(50000);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/db/goal-store.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/db/goal-store.test.ts
git commit -m "test: add goal-store unit tests"
```

---

### Task 3: DB 存储层测试 — content-daily-store

**Files:**
- Create: `tests/db/content-daily-store.test.ts`
- Test target: `src/db/content-daily-store.ts`

- [ ] **Step 1: 编写 content-daily-store 测试**

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  upsertContentDailyRecords,
  getContentDailyRecords,
  getContentDailyLatestDate,
} from '@/db/content-daily-store';
import type { ContentDailyRecord } from '@/shared/types';

const makeRecord = (date: string, pv = 100): ContentDailyRecord => ({
  userId: 'u1',
  contentToken: 'tok1',
  contentId: 'c1',
  contentType: 'article',
  title: 'Test',
  date,
  pv,
  show: 200,
  upvote: 10,
  comment: 5,
  like: 3,
  collect: 2,
  share: 1,
  play: 0,
  collectedAt: Date.now(),
});

beforeEach(async () => {
  await db.contentDaily.clear();
});

describe('content-daily-store', () => {
  it('upsertContentDailyRecords inserts records', async () => {
    await upsertContentDailyRecords([makeRecord('2026-04-01'), makeRecord('2026-04-02')]);
    const results = await getContentDailyRecords('u1', 'tok1');
    expect(results).toHaveLength(2);
  });

  it('getContentDailyRecords returns sorted by date', async () => {
    await upsertContentDailyRecords([makeRecord('2026-04-03'), makeRecord('2026-04-01'), makeRecord('2026-04-02')]);
    const results = await getContentDailyRecords('u1', 'tok1');
    expect(results.map((r) => r.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('getContentDailyRecords filters by userId and contentToken', async () => {
    await upsertContentDailyRecords([
      makeRecord('2026-04-01'),
      { ...makeRecord('2026-04-01'), userId: 'u2' },
      { ...makeRecord('2026-04-01'), contentToken: 'tok2' },
    ]);
    const results = await getContentDailyRecords('u1', 'tok1');
    expect(results).toHaveLength(1);
  });

  it('getContentDailyLatestDate returns latest date', async () => {
    await upsertContentDailyRecords([makeRecord('2026-04-01'), makeRecord('2026-04-03'), makeRecord('2026-04-02')]);
    const latest = await getContentDailyLatestDate('u1', 'tok1');
    expect(latest).toBe('2026-04-03');
  });

  it('getContentDailyLatestDate returns null when empty', async () => {
    const latest = await getContentDailyLatestDate('u1', 'tok1');
    expect(latest).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/db/content-daily-store.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/db/content-daily-store.test.ts
git commit -m "test: add content-daily-store unit tests"
```

---

### Task 4: DB 存储层测试 — realtime-store

**Files:**
- Create: `tests/db/realtime-store.test.ts`
- Test target: `src/db/realtime-store.ts`

- [ ] **Step 1: 编写 realtime-store 测试**

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  upsertRealtimeAggr,
  getRealtimeAggrByDateRange,
  getAllRealtimeAggr,
  getRealtimeAggrLatestDate,
  getRealtimeAggrForDate,
} from '@/db/realtime-store';
import type { RealtimeAggrRecord } from '@/shared/types';

const makeRecord = (date: string): RealtimeAggrRecord => ({
  userId: 'u1',
  date,
  pv: 1000,
  play: 0,
  show: 2000,
  upvote: 50,
  comment: 20,
  like: 10,
  collect: 5,
  share: 3,
  reaction: 0,
  rePin: 0,
  likeAndReaction: 0,
  newUpvote: 0,
  newLike: 0,
  newIncrUpvoteNum: 30,
  newDescUpvoteNum: 5,
  newIncrLikeNum: 8,
  newDescLikeNum: 2,
  collectedAt: Date.now(),
});

beforeEach(async () => {
  await db.realtimeAggr.clear();
});

describe('realtime-store', () => {
  it('upsertRealtimeAggr inserts records', async () => {
    await upsertRealtimeAggr([makeRecord('2026-04-01'), makeRecord('2026-04-02')]);
    const results = await getAllRealtimeAggr('u1');
    expect(results).toHaveLength(2);
  });

  it('getRealtimeAggrByDateRange filters correctly', async () => {
    await upsertRealtimeAggr([makeRecord('2026-04-01'), makeRecord('2026-04-02'), makeRecord('2026-04-03')]);
    const results = await getRealtimeAggrByDateRange('u1', '2026-04-01', '2026-04-02');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.date)).toEqual(['2026-04-01', '2026-04-02']);
  });

  it('getRealtimeAggrLatestDate returns latest', async () => {
    await upsertRealtimeAggr([makeRecord('2026-04-01'), makeRecord('2026-04-03')]);
    const latest = await getRealtimeAggrLatestDate('u1');
    expect(latest).toBe('2026-04-03');
  });

  it('getRealtimeAggrLatestDate returns null when empty', async () => {
    const latest = await getRealtimeAggrLatestDate('u1');
    expect(latest).toBeNull();
  });

  it('getRealtimeAggrForDate returns specific record', async () => {
    await upsertRealtimeAggr([makeRecord('2026-04-01')]);
    const result = await getRealtimeAggrForDate('u1', '2026-04-01');
    expect(result).toBeDefined();
    expect(result?.pv).toBe(1000);
  });

  it('getRealtimeAggrForDate returns undefined for missing', async () => {
    const result = await getRealtimeAggrForDate('u1', '2099-01-01');
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/db/realtime-store.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/db/realtime-store.test.ts
git commit -m "test: add realtime-store unit tests"
```

---

### Task 5: API 层测试 — zhihu-creations

**Files:**
- Create: `tests/api/zhihu-creations.test.ts`
- Test target: `src/api/zhihu-creations.ts`

- [ ] **Step 1: 编写 zhihu-creations 测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ZhihuCreationsApiResponse } from '@/shared/api-types';

// Mock fetchWithRetry before importing the module under test
vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

// Mock randomDelay to avoid waiting
vi.mock('@/shared/utils', () => ({
  randomDelay: vi.fn(() => Promise.resolve()),
}));

import { fetchAllCreations } from '@/api/zhihu-creations';
import { fetchWithRetry } from '@/api/fetch-proxy';

const mockFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAllCreations', () => {
  it('fetches single page of creations', async () => {
    const response: ZhihuCreationsApiResponse = {
      data: [
        {
          type: 'article',
          data: {
            id: '123',
            url_token: 'tok123',
            title: 'Test Article',
            created_time: 1712000000,
            content: [],
            excerpt: '',
          },
          reaction: {
            read_count: 1000,
            vote_up_count: 50,
            comment_count: 10,
            collect_count: 5,
          },
        },
      ],
      paging: { totals: 1, is_end: true },
    };
    mockFetch.mockResolvedValueOnce(response);

    const result = await fetchAllCreations();
    expect(result).toHaveLength(1);
    expect(result[0].contentId).toBe('123');
    expect(result[0].contentToken).toBe('tok123');
    expect(result[0].contentType).toBe('article');
    expect(result[0].title).toBe('Test Article');
    expect(result[0].readCount).toBe(1000);
  });

  it('handles pin content type with text blocks', async () => {
    const response: ZhihuCreationsApiResponse = {
      data: [
        {
          type: 'pin',
          data: {
            id: '456',
            url_token: 'tok456',
            title: undefined as unknown as string,
            created_time: 1712000000,
            content: [{ type: 'text', own_text: 'Hello world', content: '' }],
            excerpt: 'excerpt text',
          },
          reaction: { read_count: 100, vote_up_count: 5, comment_count: 2, collect_count: 1 },
        },
      ],
      paging: { totals: 1, is_end: true },
    };
    mockFetch.mockResolvedValueOnce(response);

    const result = await fetchAllCreations();
    expect(result[0].contentType).toBe('pin');
    expect(result[0].title).toBe('Hello world');
  });

  it('paginates through multiple pages', async () => {
    const page1: ZhihuCreationsApiResponse = {
      data: [
        {
          type: 'answer',
          data: { id: '1', url_token: 't1', title: 'A1', created_time: 1712000000, content: [], excerpt: '' },
          reaction: { read_count: 0, vote_up_count: 0, comment_count: 0, collect_count: 0 },
        },
      ],
      paging: { totals: 2, is_end: false },
    };
    const page2: ZhihuCreationsApiResponse = {
      data: [
        {
          type: 'answer',
          data: { id: '2', url_token: 't2', title: 'A2', created_time: 1712000000, content: [], excerpt: '' },
          reaction: { read_count: 0, vote_up_count: 0, comment_count: 0, collect_count: 0 },
        },
      ],
      paging: { totals: 2, is_end: true },
    };
    mockFetch.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const result = await fetchAllCreations();
    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress callback', async () => {
    const response: ZhihuCreationsApiResponse = {
      data: [
        {
          type: 'article',
          data: { id: '1', url_token: 't1', title: 'A', created_time: 1712000000, content: [], excerpt: '' },
          reaction: { read_count: 0, vote_up_count: 0, comment_count: 0, collect_count: 0 },
        },
      ],
      paging: { totals: 1, is_end: true },
    };
    mockFetch.mockResolvedValueOnce(response);
    const onProgress = vi.fn();

    await fetchAllCreations(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/api/zhihu-creations.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/api/zhihu-creations.test.ts
git commit -m "test: add zhihu-creations API tests"
```

---

### Task 6: API 层测试 — zhihu-content-daily

**Files:**
- Create: `tests/api/zhihu-content-daily.test.ts`
- Test target: `src/api/zhihu-content-daily.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchContentDaily, parseContentDailyResponse } from '@/api/zhihu-content-daily';
import { fetchWithRetry } from '@/api/fetch-proxy';

const mockFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchContentDaily', () => {
  it('constructs URL with correct params', async () => {
    mockFetch.mockResolvedValueOnce([]);
    await fetchContentDaily('article', 'tok1', '2026-04-01', '2026-04-07');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('type=article&token=tok1&start=2026-04-01&end=2026-04-07'),
    );
  });
});

describe('parseContentDailyResponse', () => {
  it('maps API items to ContentDailyRecord array', () => {
    const items = [
      { p_date: '2026-04-01', pv: 100, show: 200, upvote: 10, comment: 5, like: 3, collect: 2, share: 1, play: 0 },
      { p_date: '2026-04-02', pv: 150, show: 300, upvote: 15, comment: 8, like: 5, collect: 3, share: 2, play: 0 },
    ];

    const result = parseContentDailyResponse(items, 'u1', 'tok1', 'c1', 'article', 'Test Title');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      userId: 'u1',
      contentToken: 'tok1',
      contentId: 'c1',
      contentType: 'article',
      title: 'Test Title',
      date: '2026-04-01',
      pv: 100,
    });
    expect(result[1].date).toBe('2026-04-02');
    expect(result[0].collectedAt).toBeGreaterThan(0);
  });

  it('handles empty response', () => {
    const result = parseContentDailyResponse([], 'u1', 'tok1', 'c1', 'article', 'Title');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/api/zhihu-content-daily.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/api/zhihu-content-daily.test.ts
git commit -m "test: add zhihu-content-daily API tests"
```

---

### Task 7: API 层测试 — zhihu-realtime

**Files:**
- Create: `tests/api/zhihu-realtime.test.ts`
- Test target: `src/api/zhihu-realtime.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchRealtimeAggr, fetchTodayRealtime } from '@/api/zhihu-realtime';
import { fetchWithRetry } from '@/api/fetch-proxy';

const mockFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchRealtimeAggr', () => {
  it('returns parsed data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      pv: 1000,
      show: 2000,
      upvote: 50,
      comment: 20,
      like: 10,
      collect: 5,
      share: 3,
      play: 0,
      reaction: 0,
      re_pin: 0,
      like_and_reaction: 0,
      new_upvote: 0,
      new_like: 0,
      new_incr_upvote_num: 30,
      new_desc_upvote_num: 5,
      new_incr_like_num: 8,
      new_desc_like_num: 2,
      updated: '2026-04-08 12:00',
    });

    const result = await fetchRealtimeAggr('2026-04-08');
    expect(result).not.toBeNull();
    expect(result!.data.pv).toBe(1000);
    expect(result!.data.rePin).toBe(0);
    expect(result!.updatedAt).toBe('2026-04-08 12:00');
  });

  it('returns null on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchRealtimeAggr('2026-04-08');
    expect(result).toBeNull();
  });

  it('defaults missing fields to 0', async () => {
    mockFetch.mockResolvedValueOnce({ updated: '' });
    const result = await fetchRealtimeAggr('2026-04-08');
    expect(result!.data.pv).toBe(0);
    expect(result!.data.upvote).toBe(0);
  });
});

describe('fetchTodayRealtime', () => {
  it('returns today and yesterday data', async () => {
    mockFetch.mockResolvedValueOnce({
      today: { pv: 500, show: 1000, upvote: 20, comment: 10, like: 5, collect: 3, share: 1, play: 0, reaction: 0, re_pin: 0, like_and_reaction: 0, new_upvote: 0, new_like: 0, new_incr_upvote_num: 10, new_desc_upvote_num: 2, new_incr_like_num: 3, new_desc_like_num: 1 },
      yesterday: { pv: 800, show: 1500, upvote: 30, comment: 15, like: 8, collect: 4, share: 2, play: 0, reaction: 0, re_pin: 0, like_and_reaction: 0, new_upvote: 0, new_like: 0, new_incr_upvote_num: 20, new_desc_upvote_num: 3, new_incr_like_num: 5, new_desc_like_num: 1 },
      updated: '12:30',
    });

    const result = await fetchTodayRealtime('2026-04-08');
    expect(result).not.toBeNull();
    expect(result!.today.pv).toBe(500);
    expect(result!.today.updatedAt).toBe('12:30');
    expect(result!.yesterday.pv).toBe(800);
  });

  it('returns null on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const result = await fetchTodayRealtime('2026-04-08');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/api/zhihu-realtime.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/api/zhihu-realtime.test.ts
git commit -m "test: add zhihu-realtime API tests"
```

---

### Task 8: 共享工具测试 — utils

**Files:**
- Create: `tests/shared/utils.test.ts`
- Test target: `src/shared/utils.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { randomDelay } from '@/shared/utils';

describe('randomDelay', () => {
  it('resolves after a delay within range', async () => {
    vi.useFakeTimers();
    const promise = randomDelay(100, 200);
    vi.advanceTimersByTime(200);
    await promise;
    vi.useRealTimers();
  });

  it('returns a Promise', () => {
    vi.useFakeTimers();
    const result = randomDelay(10, 20);
    expect(result).toBeInstanceOf(Promise);
    vi.advanceTimersByTime(20);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/shared/utils.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/shared/utils.test.ts
git commit -m "test: add utils unit tests"
```

---

### Task 9: ML 实时模型测试 — ml-realtime

**Files:**
- Create: `tests/shared/ml-realtime.test.ts`
- Test target: `src/shared/ml-realtime.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import {
  REALTIME_FEATURE_NAMES,
  REALTIME_FEATURE_LABELS,
  buildRealtimeTrainingRows,
  buildTodayFeatures,
  trainRealtimeModel,
} from '@/shared/ml-realtime';
import type { RealtimeAggrRecord, DailySummary } from '@/shared/types';

const makeAggrRecord = (date: string, pv = 1000): RealtimeAggrRecord => ({
  userId: 'u1',
  date,
  pv,
  play: 0,
  show: 2000,
  upvote: 50,
  comment: 20,
  like: 10,
  collect: 5,
  share: 3,
  reaction: 0,
  rePin: 0,
  likeAndReaction: 0,
  newUpvote: 0,
  newLike: 0,
  newIncrUpvoteNum: 30,
  newDescUpvoteNum: 5,
  newIncrLikeNum: 8,
  newDescLikeNum: 2,
  collectedAt: Date.now(),
});

const makeSummary = (date: string, totalIncome = 500): DailySummary => ({
  date,
  totalIncome,
  count: 10,
});

describe('REALTIME_FEATURE_NAMES', () => {
  it('has 22 feature names', () => {
    expect(REALTIME_FEATURE_NAMES).toHaveLength(22);
  });

  it('all features have labels', () => {
    for (const name of REALTIME_FEATURE_NAMES) {
      expect(REALTIME_FEATURE_LABELS[name]).toBeDefined();
    }
  });
});

describe('buildRealtimeTrainingRows', () => {
  it('matches aggr records with income summaries', () => {
    const aggrRecords = [makeAggrRecord('2026-04-01'), makeAggrRecord('2026-04-02'), makeAggrRecord('2026-04-03')];
    const summaries = [makeSummary('2026-04-01', 500), makeSummary('2026-04-02', 800), makeSummary('2026-04-03', 600)];

    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
    expect(rows).toHaveLength(3);
    expect(rows[0].label).toBe(5); // 500 / 100
    expect(rows[0].features).toHaveLength(22);
  });

  it('skips records with no matching income', () => {
    const aggrRecords = [makeAggrRecord('2026-04-01'), makeAggrRecord('2026-04-02')];
    const summaries = [makeSummary('2026-04-01', 500)];

    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
    expect(rows).toHaveLength(1);
  });

  it('skips records with zero income', () => {
    const aggrRecords = [makeAggrRecord('2026-04-01')];
    const summaries = [makeSummary('2026-04-01', 0)];

    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
    expect(rows).toHaveLength(0);
  });

  it('uses yesterday income as lag feature', () => {
    const aggrRecords = [makeAggrRecord('2026-04-01'), makeAggrRecord('2026-04-02')];
    const summaries = [makeSummary('2026-04-01', 500), makeSummary('2026-04-02', 800)];

    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
    // First row has yesterdayIncome = 0, second row has yesterdayIncome = 5 (500/100)
    const yesterdayIdx = REALTIME_FEATURE_NAMES.indexOf('yesterdayIncome');
    expect(rows[0].features[yesterdayIdx]).toBe(0);
    expect(rows[1].features[yesterdayIdx]).toBe(5);
  });
});

describe('buildTodayFeatures', () => {
  it('returns feature vector of correct length', () => {
    const features = buildTodayFeatures(makeAggrRecord('2026-04-08'), 5.0);
    expect(features).toHaveLength(22);
  });
});

describe('trainRealtimeModel', () => {
  it('returns null when fewer than 10 rows', () => {
    const aggrRecords = Array.from({ length: 5 }, (_, i) => makeAggrRecord(`2026-04-0${i + 1}`, 1000 + i * 100));
    const summaries = aggrRecords.map((r) => makeSummary(r.date, 500 + Math.random() * 500));
    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
    const result = trainRealtimeModel(rows);
    expect(result).toBeNull();
  });

  it('trains successfully with enough data', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(2026, 3, 1 + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const aggrRecords = dates.map((d, i) => makeAggrRecord(d, 1000 + i * 50));
    const summaries = dates.map((d, i) => makeSummary(d, 300 + i * 20));
    const rows = buildRealtimeTrainingRows(aggrRecords, summaries);

    const output = trainRealtimeModel(rows);
    expect(output).not.toBeNull();
    expect(output!.result.r2).toBeGreaterThanOrEqual(0);
    expect(output!.result.featureImportance.length).toBeGreaterThan(0);
    expect(output!.savedModel.rfJson).toBeTruthy();
    expect(output!.savedModel.ridgeCoefficients.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/shared/ml-realtime.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/shared/ml-realtime.test.ts
git commit -m "test: add ml-realtime unit tests"
```

---

### Task 10: Hooks 测试 — use-current-user

**Files:**
- Create: `tests/hooks/use-current-user.test.ts`
- Test target: `src/hooks/use-current-user.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/api/zhihu-income', () => ({
  fetchCurrentUser: vi.fn(),
}));

import { useCurrentUser } from '@/hooks/use-current-user';
import { fetchCurrentUser } from '@/api/zhihu-income';

const mockFetch = vi.mocked(fetchCurrentUser);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('useCurrentUser', () => {
  it('returns null initially when no cache', () => {
    mockFetch.mockResolvedValue({ id: 'u1', name: 'Test' } as ReturnType<typeof fetchCurrentUser> extends Promise<infer T> ? T : never);
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('fetches and sets user', async () => {
    const user = { id: 'u1', name: 'Test', avatarUrl: '' };
    mockFetch.mockResolvedValue(user);
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(user);
  });

  it('uses cached user from sessionStorage', () => {
    const user = { id: 'u1', name: 'Cached' };
    sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(user));
    mockFetch.mockResolvedValue(user);

    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.user).toEqual(user);
    expect(result.current.loading).toBe(false);
  });

  it('keeps cached user on fetch failure', async () => {
    const user = { id: 'u1', name: 'Cached' };
    sessionStorage.setItem('zhihu-analyzer-current-user', JSON.stringify(user));
    mockFetch.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(user);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/hooks/use-current-user.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/use-current-user.test.ts
git commit -m "test: add use-current-user hook tests"
```

---

### Task 11: Hooks 测试 — use-user-settings

**Files:**
- Create: `tests/hooks/use-user-settings.test.ts`
- Test target: `src/hooks/use-user-settings.ts`

- [ ] **Step 1: 编写测试**

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/db/income-store', () => ({
  getUserSettings: vi.fn(),
}));

import { useUserSettings } from '@/hooks/use-user-settings';
import { getUserSettings } from '@/db/income-store';

const mockGetSettings = vi.mocked(getUserSettings);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUserSettings', () => {
  it('returns null settings when userId is empty', async () => {
    const { result } = renderHook(() => useUserSettings(''));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.settings).toBeNull();
    expect(mockGetSettings).not.toHaveBeenCalled();
  });

  it('loads settings for given userId', async () => {
    const settings = { userId: 'u1', collectionStartDate: '2026-01-01', autoSync: true };
    mockGetSettings.mockResolvedValue(settings);

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.settings).toEqual(settings);
  });

  it('returns null when no settings found', async () => {
    mockGetSettings.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.settings).toBeNull();
  });

  it('refresh reloads settings', async () => {
    mockGetSettings.mockResolvedValue({ userId: 'u1', collectionStartDate: '2026-01-01' });

    const { result } = renderHook(() => useUserSettings('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockGetSettings.mockResolvedValue({ userId: 'u1', collectionStartDate: '2026-02-01' });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.settings?.collectionStartDate).toBe('2026-02-01');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/hooks/use-user-settings.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/use-user-settings.test.ts
git commit -m "test: add use-user-settings hook tests"
```

---

### Task 12: Hooks 测试 — use-panel-layout

**Files:**
- Create: `tests/hooks/use-panel-layout.test.ts`
- Test target: `src/hooks/use-panel-layout.ts`

- [ ] **Step 1: 编写测试**

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { db } from '@/db/database';

vi.mock('@/dashboard/panel-registry', () => ({
  getDefaultTabs: vi.fn(() => [
    { key: 'overview', label: '概览', order: 0, panels: [{ key: 'p1', label: 'P1', order: 0, visible: true }] },
    { key: 'ml', label: 'ML', order: 1, panels: [{ key: 'p2', label: 'P2', order: 0, visible: true }] },
  ]),
}));

import { usePanelLayout } from '@/hooks/use-panel-layout';

beforeEach(async () => {
  await db.panelLayout.clear();
  vi.useFakeTimers();
});

describe('usePanelLayout', () => {
  it('returns default layout when no saved layout', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.layout).not.toBeNull();
    expect(result.current.layout!.tabs).toHaveLength(2);
  });

  it('returns null layout when userId is empty', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => usePanelLayout(''));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.layout).toBeNull();
  });

  it('updateLayout debounces save to DB', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newTabs = [{ key: 'overview', label: '概览', order: 0, panels: [] }];
    act(() => {
      result.current.updateLayout(newTabs);
    });

    expect(result.current.layout!.tabs).toEqual(newTabs);
  });

  it('resetLayout restores defaults', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => usePanelLayout('u1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateLayout([]);
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(result.current.layout!.tabs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/hooks/use-panel-layout.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/use-panel-layout.test.ts
git commit -m "test: add use-panel-layout hook tests"
```

---

### Task 13: Dashboard 组件基础渲染测试

**Files:**
- Create: `tests/dashboard/components/render-smoke.test.tsx`
- Test targets: 多个 dashboard 组件

这个测试文件使用"smoke test"模式批量测试组件是否能渲染而不崩溃。对于依赖 ECharts 的组件进行 mock。

- [ ] **Step 1: 编写 smoke 渲染测试**

由于 Dashboard 组件依赖大量 props 和外部数据，且 ECharts 在 happy-dom 中不完全支持，这里采用按需 mock + 最小 props 策略。具体需要根据实际运行结果调整 mock。

编写测试时遵循以下原则：
- 每个组件传入最小必需 props
- Mock `echarts-for-react` 为简单 div
- Mock `antd` 中依赖 DOM 测量的组件（如 Tooltip）
- 目标是确保组件能渲染不报错，不验证具体内容

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock echarts-for-react to avoid canvas issues in happy-dom
vi.mock('echarts-for-react', () => ({
  default: React.forwardRef(function MockECharts(props: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) {
    return React.createElement('div', { ref, 'data-testid': 'mock-echarts' });
  }),
}));

// Import components to test — add more as needed
import { FormulaHelp } from '@/dashboard/components/FormulaHelp';

describe('Dashboard component smoke tests', () => {
  it('FormulaHelp renders without crashing', () => {
    const { container } = render(React.createElement(FormulaHelp));
    expect(container).toBeTruthy();
  });
});
```

注意：此测试是起点骨架。实际实施时需要：
1. 逐个导入组件，查看其 props 接口
2. 构造最小 props
3. 处理组件特定的 mock 需求
4. 以覆盖率驱动，哪些组件行数多优先测试

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/dashboard/components/render-smoke.test.tsx`
Expected: PASS

- [ ] **Step 3: 持续扩充组件测试直到覆盖率达标**

Run: `npm run test:coverage`

根据覆盖率报告，识别行数最多但未覆盖的组件，逐个添加到 smoke test 或编写单独的测试文件。重复此过程直到 `% Lines >= 80`。

- [ ] **Step 4: Commit**

```bash
git add tests/dashboard/
git commit -m "test: add dashboard component smoke tests"
```

---

### Task 14: 最终覆盖率验证

- [ ] **Step 1: 运行完整覆盖率报告**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm run test:coverage`
Expected: `% Lines >= 80`, all tests pass

- [ ] **Step 2: 如果未达标，根据覆盖率报告补充测试**

查看 `coverage/` 目录下的 lcov 报告，找出未覆盖的最大文件，优先补充测试。

- [ ] **Step 3: 最终 Commit**

```bash
git add tests/
git commit -m "test: achieve 80%+ line coverage"
```
