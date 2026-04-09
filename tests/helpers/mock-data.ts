import type { DailySummary, IncomeRecord, ContentDailyRecord, RealtimeAggrRecord, TabConfig } from '@/shared/types';

export function makeDailySummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: '2024-01-15',
    totalIncome: 10000,
    totalRead: 5000,
    totalInteraction: 200,
    contentCount: 10,
    ...overrides,
  };
}

export function makeDailySummaries(count: number, startDate = '2024-01-01'): DailySummary[] {
  const result: DailySummary[] = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push(
      makeDailySummary({
        date: dateStr,
        totalIncome: 5000 + Math.floor(Math.random() * 10000),
        totalRead: 2000 + Math.floor(Math.random() * 5000),
        totalInteraction: 50 + Math.floor(Math.random() * 200),
        contentCount: 5 + Math.floor(Math.random() * 10),
      }),
    );
  }
  return result;
}

export function makeIncomeRecord(overrides: Partial<IncomeRecord> = {}): IncomeRecord {
  return {
    userId: 'user-1',
    contentId: 'content-1',
    contentToken: 'token-1',
    title: 'Test Article',
    contentType: 'article',
    publishDate: '2024-01-10',
    recordDate: '2024-01-15',
    currentRead: 1000,
    currentInteraction: 50,
    currentIncome: 2000,
    totalRead: 5000,
    totalInteraction: 200,
    totalIncome: 10000,
    collectedAt: Date.now(),
    ...overrides,
  };
}

export function makeIncomeRecords(count: number): IncomeRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeIncomeRecord({
      contentId: `content-${i}`,
      contentToken: `token-${i}`,
      title: `Article ${i}`,
      contentType: i % 3 === 0 ? 'answer' : i % 3 === 1 ? 'article' : 'pin',
      publishDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      recordDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      currentIncome: 1000 + i * 500,
      currentRead: 500 + i * 100,
      currentInteraction: 10 + i * 5,
    }),
  );
}

export function makeContentDailyRecord(overrides: Partial<ContentDailyRecord> = {}): ContentDailyRecord {
  return {
    userId: 'user-1',
    contentToken: 'token-1',
    contentId: 'content-1',
    contentType: 'article',
    title: 'Test Article',
    date: '2024-01-15',
    pv: 1000,
    show: 2000,
    upvote: 50,
    comment: 10,
    like: 30,
    collect: 5,
    share: 3,
    play: 0,
    collectedAt: Date.now(),
    ...overrides,
  };
}

export function makeContentDailyRecords(count: number): ContentDailyRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeContentDailyRecord({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      pv: 500 + i * 100,
      show: 1000 + i * 200,
    }),
  );
}

export function makeRealtimeAggrRecord(overrides: Partial<RealtimeAggrRecord> = {}): RealtimeAggrRecord {
  return {
    userId: 'user-1',
    date: '2024-01-15',
    updatedAt: '2024-01-15T12:00:00Z',
    pv: 5000,
    play: 0,
    show: 10000,
    upvote: 100,
    comment: 20,
    like: 60,
    collect: 10,
    share: 5,
    newIncrUpvoteNum: 5,
    newDescUpvoteNum: 1,
    newIncrLikeNum: 3,
    newDescLikeNum: 0,
    collectedAt: Date.now(),
    ...overrides,
  };
}

export function makeDefaultTabs(): TabConfig[] {
  return [
    {
      key: 'overview',
      label: '总览',
      visible: true,
      order: 0,
      panels: [
        { key: 'incomeGoal', visible: true, order: 0 },
        { key: 'dailyTrend', visible: true, order: 1 },
        { key: 'contentTypeComparison', visible: true, order: 2 },
        { key: 'rpm', visible: true, order: 3 },
      ],
    },
    { key: 'content', label: '内容明细', visible: true, order: 1, panels: [] },
    {
      key: 'ml',
      label: '智能分析',
      visible: true,
      order: 2,
      panels: [{ key: 'mlPrediction', visible: true, order: 0 }],
    },
  ];
}
