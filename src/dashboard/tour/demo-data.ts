/**
 * Demo data for onboarding tour — shown when user has no real data yet.
 */
import type { DailySummary, IncomeRecord } from '@/shared/types';

const DEMO_USER_ID = 'demo';

/** Generate a date string N days ago from today */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Pseudo-random number seeded by day index for deterministic demo data */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generateDemoSummaries(): DailySummary[] {
  const summaries: DailySummary[] = [];
  for (let i = 29; i >= 0; i--) {
    const seed = i;
    const baseRead = 800 + Math.floor(seededRandom(seed) * 1200);
    const baseIncome = Math.floor(baseRead * (0.8 + seededRandom(seed + 100) * 0.6));
    const interaction = Math.floor(baseRead * (0.02 + seededRandom(seed + 200) * 0.04));
    summaries.push({
      date: daysAgo(i),
      totalIncome: baseIncome,
      totalRead: baseRead,
      totalInteraction: interaction,
      contentCount: 3 + Math.floor(seededRandom(seed + 300) * 5),
    });
  }
  return summaries;
}

const DEMO_CONTENTS = [
  {
    id: 'demo-1',
    token: 'demo-token-1',
    type: 'article',
    title: '如何高效学习编程：从零到一的实践指南',
    publishDate: daysAgo(60),
  },
  { id: 'demo-2', token: 'demo-token-2', type: 'answer', title: '程序员如何提高工作效率？', publishDate: daysAgo(45) },
  {
    id: 'demo-3',
    token: 'demo-token-3',
    type: 'article',
    title: '深入理解 JavaScript 异步编程模型',
    publishDate: daysAgo(30),
  },
  {
    id: 'demo-4',
    token: 'demo-token-4',
    type: 'answer',
    title: '前端开发中有哪些常见的性能优化技巧？',
    publishDate: daysAgo(20),
  },
  {
    id: 'demo-5',
    token: 'demo-token-5',
    type: 'article',
    title: 'React 18 新特性全面解析与实战',
    publishDate: daysAgo(10),
  },
  {
    id: 'demo-6',
    token: 'demo-token-6',
    type: 'pin',
    title: '分享一个提升代码质量的小技巧：善用 TypeScript 的类型收窄',
    publishDate: daysAgo(25),
  },
  {
    id: 'demo-7',
    token: 'demo-token-7',
    type: 'pin',
    title: '今天发现了一个有趣的 CSS 技巧，用 container queries 替代 media queries',
    publishDate: daysAgo(15),
  },
];

function generateDemoRecords(): IncomeRecord[] {
  const records: IncomeRecord[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = daysAgo(i);
    for (const content of DEMO_CONTENTS) {
      const daysSincePublish = Math.max(0, 30 - i - parseInt(content.publishDate.slice(-2)));
      if (daysSincePublish < 0) continue;

      const seed = i * 100 + DEMO_CONTENTS.indexOf(content);
      const decay = Math.max(0.3, 1 - daysSincePublish * 0.02);
      const baseRead = Math.floor((150 + seededRandom(seed) * 300) * decay);
      const income = Math.floor(baseRead * (0.6 + seededRandom(seed + 50) * 0.8));
      const interaction = Math.floor(baseRead * (0.015 + seededRandom(seed + 80) * 0.035));

      records.push({
        userId: DEMO_USER_ID,
        contentId: content.id,
        contentToken: content.token,
        title: content.title,
        contentType: content.type,
        publishDate: content.publishDate,
        recordDate: date,
        currentRead: baseRead,
        currentInteraction: interaction,
        currentIncome: income,
        totalRead: baseRead * (30 - i),
        totalInteraction: interaction * (30 - i),
        totalIncome: income * (30 - i),
        collectedAt: Date.now(),
      });
    }
  }
  return records;
}

let _cachedSummaries: DailySummary[] | null = null;
let _cachedRecords: IncomeRecord[] | null = null;

export function getDemoSummaries(): DailySummary[] {
  if (!_cachedSummaries) _cachedSummaries = generateDemoSummaries();
  return _cachedSummaries;
}

export function getDemoRecords(): IncomeRecord[] {
  if (!_cachedRecords) _cachedRecords = generateDemoRecords();
  return _cachedRecords;
}
