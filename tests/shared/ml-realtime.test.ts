import { describe, it, expect } from 'vitest';
import {
  REALTIME_FEATURE_NAMES,
  REALTIME_FEATURE_LABELS,
  buildRealtimeTrainingRows,
  buildTodayFeatures,
  trainRealtimeModel,
  predictWithRealtimeModel,
} from '@/shared/ml-realtime';
import type { RealtimeAggrRecord, DailySummary } from '@/shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(date: string, overrides: Partial<RealtimeAggrRecord> = {}): RealtimeAggrRecord {
  return {
    userId: 'user1',
    date,
    updatedAt: date,
    pv: 1000,
    play: 50,
    show: 5000,
    upvote: 80,
    comment: 20,
    like: 30,
    collect: 10,
    share: 5,
    reaction: 3,
    rePin: 2,
    likeAndReaction: 33,
    newUpvote: 10,
    newLike: 5,
    newIncrUpvoteNum: 12,
    newDescUpvoteNum: 2,
    newIncrLikeNum: 6,
    newDescLikeNum: 1,
    collectedAt: Date.now(),
    ...overrides,
  };
}

function makeSummary(date: string, totalIncomeYuan: number): DailySummary {
  return {
    date,
    totalIncome: Math.round(totalIncomeYuan * 100), // stored in fen
    totalRead: 1000,
    totalInteraction: 100,
    contentCount: 5,
  };
}

/** Generate N consecutive dates starting from startDate (YYYY-MM-DD) */
function generateDates(startDate: string, n: number): string[] {
  const start = new Date(startDate);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// ── REALTIME_FEATURE_NAMES ────────────────────────────────────────────────────

describe('REALTIME_FEATURE_NAMES', () => {
  it('has exactly 22 entries', () => {
    expect(REALTIME_FEATURE_NAMES).toHaveLength(22);
  });
});

// ── REALTIME_FEATURE_LABELS ───────────────────────────────────────────────────

describe('REALTIME_FEATURE_LABELS', () => {
  it('provides a Chinese label for every feature name', () => {
    for (const name of REALTIME_FEATURE_NAMES) {
      expect(REALTIME_FEATURE_LABELS[name], `missing label for feature "${name}"`).toBeTruthy();
    }
  });
});

// ── buildRealtimeTrainingRows ─────────────────────────────────────────────────

describe('buildRealtimeTrainingRows', () => {
  it('matches records with corresponding summaries', () => {
    const dates = generateDates('2026-01-01', 5);
    const records = dates.map((d) => makeRecord(d));
    const summaries = dates.map((d) => makeSummary(d, 1.5));

    const rows = buildRealtimeTrainingRows(records, summaries);
    expect(rows).toHaveLength(5);
    rows.forEach((row) => {
      expect(row.label).toBeCloseTo(1.5, 5);
    });
  });

  it('skips records where income is missing', () => {
    const dates = generateDates('2026-02-01', 4);
    const records = dates.map((d) => makeRecord(d));
    // Only provide summaries for 2 of the 4 dates
    const summaries = [makeSummary(dates[1], 2.0), makeSummary(dates[3], 3.0)];

    const rows = buildRealtimeTrainingRows(records, summaries);
    expect(rows).toHaveLength(2);
  });

  it('skips records where income is zero', () => {
    const dates = generateDates('2026-03-01', 3);
    const records = dates.map((d) => makeRecord(d));
    const summaries = [
      makeSummary(dates[0], 0), // zero → skipped
      makeSummary(dates[1], 1.0),
      makeSummary(dates[2], 2.0),
    ];

    const rows = buildRealtimeTrainingRows(records, summaries);
    expect(rows).toHaveLength(2);
  });

  it('uses yesterday income as a lag feature', () => {
    const dates = generateDates('2026-04-01', 3);
    const records = dates.map((d) => makeRecord(d));
    const incomes = [1.0, 2.0, 3.0];
    const summaries = dates.map((d, i) => makeSummary(d, incomes[i]));

    const rows = buildRealtimeTrainingRows(records, summaries);
    // rows are sorted by date; yesterdayIncome is the last element (index 21) of features
    expect(rows[0].features[21]).toBe(0); // no yesterday for first row
    expect(rows[1].features[21]).toBeCloseTo(1.0, 5); // yesterday = day 1
    expect(rows[2].features[21]).toBeCloseTo(2.0, 5); // yesterday = day 2
  });
});

// ── buildTodayFeatures ────────────────────────────────────────────────────────

describe('buildTodayFeatures', () => {
  it('returns a feature vector with length 22', () => {
    const record = makeRecord('2026-04-01');
    const features = buildTodayFeatures(record, 1.5);
    expect(features).toHaveLength(22);
  });

  it('embeds yesterdayIncome as the last feature', () => {
    const record = makeRecord('2026-04-01');
    const features = buildTodayFeatures(record, 4.2);
    expect(features[21]).toBeCloseTo(4.2, 5);
  });
});

// ── trainRealtimeModel ────────────────────────────────────────────────────────

describe('trainRealtimeModel', () => {
  it('returns null when fewer than 10 rows are provided', () => {
    const dates = generateDates('2026-01-01', 9);
    const records = dates.map((d) => makeRecord(d));
    const summaries = dates.map((d) => makeSummary(d, 1.5));
    const rows = buildRealtimeTrainingRows(records, summaries);
    expect(rows.length).toBeLessThan(10);
    expect(trainRealtimeModel(rows)).toBeNull();
  });

  it('succeeds and returns valid result structure with 30+ rows', () => {
    const dates = generateDates('2026-01-01', 35);
    const records = dates.map((d, i) => makeRecord(d, { pv: 1000 + i * 10, upvote: 50 + i, comment: 10 + i }));
    const summaries = dates.map((d, i) => makeSummary(d, 1.0 + i * 0.05));
    const rows = buildRealtimeTrainingRows(records, summaries);

    const output = trainRealtimeModel(rows);

    expect(output).not.toBeNull();
    const { result, savedModel } = output!;

    // result fields
    expect(typeof result.r2).toBe('number');
    expect(result.r2).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.featureImportance)).toBe(true);
    expect(result.featureImportance.length).toBeGreaterThan(0);
    expect(result.dataCount).toBe(rows.length);

    // savedModel fields
    expect(typeof savedModel.rfJson).toBe('string');
    expect(Array.isArray(savedModel.ridgeCoefficients)).toBe(true);
    expect(typeof savedModel.rfWeight).toBe('number');
    expect(typeof savedModel.ridgeWeight).toBe('number');
    expect(typeof savedModel.evaluation).toBe('string');
  });

  it('calls onProgress with step updates', () => {
    const dates = generateDates('2026-01-01', 30);
    const records = dates.map((d) => makeRecord(d));
    const summaries = dates.map((d, i) => makeSummary(d, 1.0 + i * 0.05));
    const rows = buildRealtimeTrainingRows(records, summaries);

    const steps: number[] = [];
    trainRealtimeModel(rows, ({ step }) => steps.push(step));

    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toBe(1);
  });
});

// ── predictWithRealtimeModel ──────────────────────────────────────────────────

describe('predictWithRealtimeModel', () => {
  it('produces a non-negative numeric prediction (round-trip)', () => {
    const dates = generateDates('2026-01-01', 35);
    const records = dates.map((d, i) => makeRecord(d, { pv: 1000 + i * 10, upvote: 50 + i, comment: 10 + i }));
    const summaries = dates.map((d, i) => makeSummary(d, 1.0 + i * 0.05));
    const rows = buildRealtimeTrainingRows(records, summaries);

    const output = trainRealtimeModel(rows)!;
    const features = buildTodayFeatures(makeRecord('2026-03-01'), 2.0);
    const prediction = predictWithRealtimeModel(output.savedModel, features);

    expect(typeof prediction).toBe('number');
    expect(prediction).toBeGreaterThanOrEqual(0);
  });
});
