import { describe, expect, it } from 'vitest';
import {
  FEATURE_NAMES,
  buildContentFeatureRows,
  buildFeatureRows,
  buildPredictionFeatures,
  fitScaler,
  transformFeatures,
} from '@/shared/ml-features';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';

function createIncomeRecord(overrides: Partial<IncomeRecord> = {}): IncomeRecord {
  return {
    userId: 'user-1',
    contentId: 'content-1',
    contentToken: 'token-1',
    title: 'Test content',
    contentType: 'article',
    publishDate: '2026-03-01',
    recordDate: '2026-03-01',
    currentRead: 1000,
    currentInteraction: 100,
    currentIncome: 500,
    totalRead: 1000,
    totalInteraction: 100,
    totalIncome: 500,
    collectedAt: 1710000000000,
    ...overrides,
  };
}

function createDailyRecord(overrides: Partial<ContentDailyRecord> = {}): ContentDailyRecord {
  return {
    userId: 'user-1',
    contentToken: 'token-1',
    contentId: 'content-1',
    contentType: 'article',
    title: 'Test content',
    date: '2026-03-01',
    pv: 100,
    show: 200,
    upvote: 10,
    comment: 5,
    like: 0,
    collect: 3,
    share: 2,
    play: 0,
    collectedAt: 1710000000000,
    ...overrides,
  };
}

describe('FEATURE_NAMES', () => {
  it('matches the exported daily feature vector dimension', () => {
    expect(FEATURE_NAMES).toHaveLength(27);
    expect(FEATURE_NAMES.at(0)).toBe('pv');
    expect(FEATURE_NAMES.at(-1)).toBe('log_income_lag1');
  });
});

describe('buildFeatureRows', () => {
  it('builds aligned daily feature rows with valid ranges and lag features', () => {
    const dailyRecords = [
      createDailyRecord({ date: '2026-03-01', pv: 100, show: 200, upvote: 10, comment: 5, collect: 3, share: 2 }),
      createDailyRecord({ date: '2026-03-02', pv: 160, show: 260, upvote: 16, comment: 8, collect: 4, share: 4 }),
      createDailyRecord({ date: '2026-03-03', pv: 220, show: 320, upvote: 20, comment: 10, collect: 5, share: 5 }),
      createDailyRecord({ contentToken: 'token-2', contentId: 'content-2', date: '2026-03-01', pv: 90 }),
    ];
    const incomeRecords = [
      createIncomeRecord({ recordDate: '2026-03-01', currentIncome: 500, currentRead: 100, currentInteraction: 20 }),
      createIncomeRecord({ recordDate: '2026-03-02', currentIncome: 700, currentRead: 160, currentInteraction: 32 }),
      createIncomeRecord({ recordDate: '2026-03-03', currentIncome: 900, currentRead: 220, currentInteraction: 40 }),
      createIncomeRecord({
        contentId: 'content-2',
        contentToken: 'token-2',
        recordDate: '2026-03-01',
        currentIncome: 0,
      }),
    ];

    const rows = buildFeatureRows(dailyRecords, incomeRecords);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.features.length === FEATURE_NAMES.length)).toBe(true);

    const firstRow = rows[0];
    expect(firstRow.date).toBe('2026-03-01');
    expect(firstRow.contentId).toBe('content-1');
    expect(firstRow.label).toBe(5);
    expect(firstRow.features[11]).toBeCloseTo(0.2, 10);
    expect(firstRow.features[12]).toBeCloseTo(0.1, 10);
    expect(firstRow.features[13]).toBeCloseTo(0.05, 10);
    expect(firstRow.features[14]).toBeCloseTo(0.03, 10);
    expect(firstRow.features[21]).toBe(0);
    expect(firstRow.features[23]).toBe(100);
    expect(firstRow.features[25]).toBe(0);

    const lastRow = rows[2];
    expect(lastRow.label).toBe(9);
    expect(lastRow.features[21]).toBe(2);
    expect(lastRow.features[23]).toBeCloseTo((220 + 160 + 100) / 3, 10);
    expect(lastRow.features[25]).toBe(7);

    for (const row of rows) {
      expect(row.features[19]).toBeGreaterThanOrEqual(-1);
      expect(row.features[19]).toBeLessThanOrEqual(1);
      expect(row.features[20]).toBeGreaterThanOrEqual(-1);
      expect(row.features[20]).toBeLessThanOrEqual(1);
      expect(row.features[11]).toBeGreaterThanOrEqual(0);
      expect(row.features[12]).toBeGreaterThanOrEqual(0);
      expect(row.features[13]).toBeGreaterThanOrEqual(0);
      expect(row.features[14]).toBeGreaterThanOrEqual(0);
      expect(row.features[22]).toBeGreaterThanOrEqual(0);
      expect(row.features[24]).toBeGreaterThanOrEqual(0);
      expect(row.features[26]).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty array for empty input', () => {
    expect(buildFeatureRows([], [])).toEqual([]);
  });

  it('handles a single record and zero pv without invalid rates', () => {
    const rows = buildFeatureRows(
      [createDailyRecord({ pv: 0, show: 0, upvote: 0, comment: 0, collect: 0, share: 0 })],
      [createIncomeRecord({ currentIncome: 300, currentRead: 0, currentInteraction: 0 })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].features).toHaveLength(FEATURE_NAMES.length);
    expect(rows[0].features[11]).toBe(0);
    expect(rows[0].features[12]).toBe(0);
    expect(rows[0].features[13]).toBe(0);
    expect(rows[0].features[14]).toBe(0);
    expect(rows[0].features[23]).toBe(0);
    expect(rows[0].features[25]).toBe(0);
    expect(rows[0].label).toBe(3);
  });
});

describe('buildContentFeatureRows', () => {
  it('aggregates income records per content with stable feature dimensions', () => {
    const rows = buildContentFeatureRows([
      createIncomeRecord({
        contentId: 'content-1',
        contentToken: 'token-1',
        recordDate: '2026-03-01',
        currentRead: 100,
        currentInteraction: 20,
        currentIncome: 500,
      }),
      createIncomeRecord({
        contentId: 'content-1',
        contentToken: 'token-1',
        recordDate: '2026-03-02',
        currentRead: 200,
        currentInteraction: 30,
        currentIncome: 700,
      }),
      createIncomeRecord({
        contentId: 'content-2',
        contentToken: 'token-2',
        recordDate: '2026-03-01',
        currentRead: 0,
        currentInteraction: 10,
        currentIncome: 300,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].features).toHaveLength(8);
    expect(rows[0].contentId).toBe('content-1');
    expect(rows[0].label).toBe(12);
    expect(rows[0].features[0]).toBe(300);
    expect(rows[0].features[1]).toBe(50);
    expect(rows[0].features[2]).toBeCloseTo(50 / 300, 10);
    expect(rows[0].features[3]).toBe(150);
    expect(rows[0].features[4]).toBe(6);
    expect(rows[0].features[5]).toBe(2);
    expect(rows[0].features[6]).toBeGreaterThan(0);
    expect(rows[0].features[7]).toBeGreaterThan(0);
  });

  it('returns an empty array for empty input', () => {
    expect(buildContentFeatureRows([])).toEqual([]);
  });

  it('handles a single valid income record', () => {
    const rows = buildContentFeatureRows([
      createIncomeRecord({ currentRead: 80, currentInteraction: 8, currentIncome: 400 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].features).toEqual([80, 8, 0.1, 80, 4, 1, 0.0064, 0.00064]);
    expect(rows[0].label).toBe(4);
  });
});

describe('buildPredictionFeatures', () => {
  it('builds prediction features with moving average and previous income', () => {
    const features = buildPredictionFeatures(
      createDailyRecord({ date: '2026-03-03', pv: 240, show: 360, upvote: 18, comment: 12, collect: 6, share: 4 }),
      '2026-03-01',
      [createDailyRecord({ date: '2026-03-01', pv: 120 }), createDailyRecord({ date: '2026-03-02', pv: 180 })],
      8.5,
    );

    expect(features).toHaveLength(FEATURE_NAMES.length);
    expect(features[11]).toBeCloseTo((18 + 12 + 6 + 4) / 240, 10);
    expect(features[19]).toBeGreaterThanOrEqual(-1);
    expect(features[19]).toBeLessThanOrEqual(1);
    expect(features[20]).toBeGreaterThanOrEqual(-1);
    expect(features[20]).toBeLessThanOrEqual(1);
    expect(features[21]).toBe(2);
    expect(features[23]).toBe(180);
    expect(features[25]).toBe(8.5);
    expect(features[24]).toBeGreaterThan(0);
    expect(features[26]).toBeGreaterThan(0);
  });

  it('uses zero defaults when no prior data is provided', () => {
    const features = buildPredictionFeatures(
      createDailyRecord({ pv: 0, show: 0, upvote: 0, comment: 0, collect: 0, share: 0 }),
      '',
    );

    expect(features).toHaveLength(FEATURE_NAMES.length);
    expect(features[11]).toBe(0);
    expect(features[21]).toBe(0);
    expect(features[23]).toBe(0);
    expect(features[25]).toBe(0);
    expect(features[26]).toBe(0);
  });
});

describe('fitScaler', () => {
  it('computes per-column means and standard deviations', () => {
    const scaler = fitScaler([
      [1, 2, 5],
      [3, 4, 5],
    ]);

    expect(scaler.means).toEqual([2, 3, 5]);
    expect(scaler.stds[0]).toBeCloseTo(1, 10);
    expect(scaler.stds[1]).toBeCloseTo(1, 10);
    expect(scaler.stds[2]).toBe(1);
  });

  it('returns empty arrays for empty input', () => {
    expect(fitScaler([])).toEqual({ means: [], stds: [] });
  });

  it('uses a fallback std of 1 for a single row', () => {
    const scaler = fitScaler([[10, 20]]);
    expect(scaler.means).toEqual([10, 20]);
    expect(scaler.stds).toEqual([1, 1]);
  });
});

describe('transformFeatures', () => {
  it('normalizes features using the provided scaler', () => {
    const source = [
      [1, 2],
      [3, 4],
    ];
    const transformed = transformFeatures(source, fitScaler(source));

    expect(transformed).toHaveLength(2);
    expect(transformed[0][0]).toBeCloseTo(-1, 10);
    expect(transformed[0][1]).toBeCloseTo(-1, 10);
    expect(transformed[1][0]).toBeCloseTo(1, 10);
    expect(transformed[1][1]).toBeCloseTo(1, 10);
  });

  it('returns an empty array for empty features', () => {
    expect(transformFeatures([], { means: [], stds: [] })).toEqual([]);
  });

  it('handles a single row without producing infinities', () => {
    const transformed = transformFeatures([[10, 20]], { means: [10, 20], stds: [1, 1] });
    expect(transformed).toEqual([[0, 0]]);
  });
});
