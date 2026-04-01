import { describe, expect, it } from 'vitest';
import {
  computeRPM,
  detectAnomalies,
  earlyPerformanceMultiplier,
  efficiencyFrontier,
  ema,
  exponentialDecayFit,
  holtForecast,
  interactionRegression,
  percentileRanks,
  powerLawDecayFit,
  quantileRegression,
  quantileRegressionPredict,
  residualAnalysis,
  ridgeRegression,
  weeklySeasonality,
} from '@/shared/stats';

describe('computeRPM', () => {
  it('computes rpm for positive income and reads', () => {
    expect(computeRPM(12.5, 2500)).toBeCloseTo(5, 5);
  });

  it('returns 0 when reads is zero', () => {
    expect(computeRPM(100, 0)).toBe(0);
  });

  it('returns 0 when both income and reads are zero', () => {
    expect(computeRPM(0, 0)).toBe(0);
  });
});

describe('ema', () => {
  it('smooths a basic series using the configured span', () => {
    const result = ema([10, 20, 30], 2);
    expect(result[0]).toBeCloseTo(10, 10);
    expect(result[1]).toBeCloseTo(16.666666666666664, 10);
    expect(result[2]).toBeCloseTo(25.555555555555554, 10);
  });

  it('returns an empty array for empty input', () => {
    expect(ema([], 3)).toEqual([]);
  });

  it('returns the original first value for a single-element series', () => {
    expect(ema([42], 5)).toEqual([42]);
  });
});

describe('holtForecast', () => {
  it('returns smoothed values and non-negative forecasts for a rising trend', () => {
    const result = holtForecast([10, 20, 30, 40], 0.5, 0.3, 3);

    expect(result.smoothed).toHaveLength(4);
    expect(result.forecast).toHaveLength(3);
    expect(result.forecast[1]).toBeGreaterThan(result.forecast[0]);
    expect(result.forecast.every((value) => value >= 0)).toBe(true);
  });

  it('returns no forecast when fewer than two values are provided', () => {
    expect(holtForecast([7])).toEqual({ smoothed: [7], forecast: [] });
  });

  it('clamps negative forecasts to zero', () => {
    const result = holtForecast([10, 0], 0.3, 0.8, 3);
    expect(result.forecast).toEqual([0, 0, 0]);
  });
});

describe('weeklySeasonality', () => {
  it('aggregates average and count by weekday', () => {
    const dates = ['2024-01-07T12:00:00', '2024-01-14T12:00:00', '2024-01-08T12:00:00'];
    const values = [10, 30, 20];
    const result = weeklySeasonality(dates, values);

    expect(result[0]).toEqual({ dayOfWeek: 0, avg: 20, count: 2 });
    expect(result[1]).toEqual({ dayOfWeek: 1, avg: 20, count: 1 });
  });

  it('returns seven zero-filled buckets for empty input', () => {
    expect(weeklySeasonality([], [])).toEqual([
      { dayOfWeek: 0, avg: 0, count: 0 },
      { dayOfWeek: 1, avg: 0, count: 0 },
      { dayOfWeek: 2, avg: 0, count: 0 },
      { dayOfWeek: 3, avg: 0, count: 0 },
      { dayOfWeek: 4, avg: 0, count: 0 },
      { dayOfWeek: 5, avg: 0, count: 0 },
      { dayOfWeek: 6, avg: 0, count: 0 },
    ]);
  });

  it('tracks zero values in counts without affecting averages incorrectly', () => {
    const result = weeklySeasonality(['2024-01-09T12:00:00'], [0]);
    expect(result[2]).toEqual({ dayOfWeek: 2, avg: 0, count: 1 });
  });
});

describe('exponentialDecayFit', () => {
  it('fits an ideal exponential decay curve', () => {
    const values = [100, 50, 25, 12.5, 6.25];
    const result = exponentialDecayFit(values);

    expect(result).not.toBeNull();
    expect(result?.A).toBeCloseTo(100, 1);
    expect(result?.lambda).toBeCloseTo(Math.log(2), 1);
    expect(result?.halfLife).toBeCloseTo(1, 1);
    expect(result?.r2).toBeGreaterThan(0.99);
  });

  it('returns null when there are fewer than three positive points', () => {
    expect(exponentialDecayFit([10, 0, 0])).toBeNull();
  });

  it('returns null for non-decaying data', () => {
    expect(exponentialDecayFit([1, 2, 4, 8])).toBeNull();
  });
});

describe('powerLawDecayFit', () => {
  it('fits an ideal power-law decay curve', () => {
    const values = [100, 25, 11.11111111111111, 6.25, 4];
    const result = powerLawDecayFit(values);

    expect(result).not.toBeNull();
    expect(result?.A).toBeCloseTo(100, 1);
    expect(result?.alpha).toBeCloseTo(2, 1);
    expect(result?.r2).toBeGreaterThan(0.99);
  });

  it('returns null when there are fewer than three positive values', () => {
    expect(powerLawDecayFit([5, 0, 0])).toBeNull();
  });

  it('ignores zeros while fitting later positive values', () => {
    const result = powerLawDecayFit([100, 0, 11.11111111111111, 6.25, 4]);
    expect(result).not.toBeNull();
    expect(result?.alpha).toBeGreaterThan(1);
  });
});

describe('earlyPerformanceMultiplier', () => {
  it('returns the average total-to-early-income ratio', () => {
    const result = earlyPerformanceMultiplier(
      [
        { firstNDays: 10, total: 30 },
        { firstNDays: 20, total: 40 },
      ],
      7,
    );

    expect(result).toEqual({ multiplier: 2.5, sampleSize: 2 });
  });

  it('ignores rows with non-positive early or total income', () => {
    const result = earlyPerformanceMultiplier(
      [
        { firstNDays: 10, total: 20 },
        { firstNDays: 0, total: 50 },
        { firstNDays: 5, total: 0 },
      ],
      3,
    );

    expect(result).toEqual({ multiplier: 2, sampleSize: 1 });
  });

  it('returns zeroes when no valid samples exist', () => {
    expect(
      earlyPerformanceMultiplier(
        [
          { firstNDays: 0, total: 0 },
          { firstNDays: 0, total: 10 },
        ],
        5,
      ),
    ).toEqual({ multiplier: 0, sampleSize: 0 });
  });
});

describe('ridgeRegression', () => {
  it('fits a simple linear relationship with a high r2', () => {
    const result = ridgeRegression([[1, 2, 3, 4]], [3, 5, 7, 9], 0.01);

    expect(result.coefficients[0]).toBeCloseTo(1, 1);
    expect(result.coefficients[1]).toBeCloseTo(2, 1);
    expect(result.r2).toBeGreaterThan(0.99);
  });

  it('shrinks coefficients more strongly when lambda increases', () => {
    const lowPenalty = ridgeRegression([[1, 2, 3, 4]], [2, 4, 6, 8], 0.01);
    const highPenalty = ridgeRegression([[1, 2, 3, 4]], [2, 4, 6, 8], 100);

    expect(Math.abs(highPenalty.coefficients[1])).toBeLessThan(Math.abs(lowPenalty.coefficients[1]));
  });

  it('returns zero coefficients for insufficient data', () => {
    expect(ridgeRegression([[1]], [2])).toEqual({ coefficients: [0, 0], r2: 0 });
  });
});

describe('interactionRegression', () => {
  it('includes original and interaction terms, sorted by coefficient magnitude', () => {
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 2, 1, 2];
    const interaction = x1.map((value, index) => value * x2[index]);
    const y = x1.map((value, index) => 1 + value + 0.5 * x2[index] + 2 * interaction[index]);

    const result = interactionRegression([x1, x2], y, ['reads', 'likes']);
    const names = result.terms.map((term) => term.name);

    expect(names).toContain('reads');
    expect(names).toContain('likes');
    expect(names).toContain('reads×likes');
    expect(result.terms[0].name).toBe('reads×likes');
    expect(result.r2).toBeGreaterThan(0.9);
  });

  it('works with a single feature and does not invent interaction terms', () => {
    const result = interactionRegression([[1, 2, 3]], [2, 4, 6], ['reads']);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].name).toBe('reads');
  });

  it('returns zero-like output for insufficient data', () => {
    const result = interactionRegression([[1]], [2], ['reads']);
    expect(result.r2).toBe(0);
    expect(result.terms).toEqual([{ name: 'reads', coeff: 0 }]);
  });
});

describe('quantileRegression', () => {
  it('matches a near-perfect linear relationship', () => {
    const coefficients = quantileRegression([[1, 2, 3, 4]], [3, 5, 7, 9], 0.5);
    expect(coefficients[0]).toBeCloseTo(1, 1);
    expect(coefficients[1]).toBeCloseTo(2, 1);
  });

  it('returns zero coefficients for insufficient data', () => {
    expect(quantileRegression([[1]], [2], 0.5)).toEqual([0, 0]);
  });

  it('produces a higher prediction for a higher quantile on skewed data', () => {
    const xs = [[1, 2, 3, 4, 5]];
    const y = [2, 4, 6, 8, 20];
    const low = quantileRegression(xs, y, 0.2);
    const high = quantileRegression(xs, y, 0.8);
    const lowPrediction = low[0] + low[1] * 5;
    const highPrediction = high[0] + high[1] * 5;

    expect(highPrediction).toBeGreaterThan(lowPrediction);
  });
});

describe('quantileRegressionPredict', () => {
  it('returns one coefficient set per tau', () => {
    const result = quantileRegressionPredict([[1, 2, 3, 4]], [3, 5, 7, 9], [0.25, 0.5, 0.75]);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.tau)).toEqual([0.25, 0.5, 0.75]);
  });

  it('reuses quantileRegression behavior for exact linear data', () => {
    const result = quantileRegressionPredict([[1, 2, 3]], [2, 4, 6], [0.25, 0.75]);

    for (const item of result) {
      expect(item.coefficients[0]).toBeCloseTo(0, 1);
      expect(item.coefficients[1]).toBeCloseTo(2, 1);
    }
  });

  it('returns an empty list when no quantiles are requested', () => {
    expect(quantileRegressionPredict([[1, 2, 3]], [2, 4, 6], [])).toEqual([]);
  });
});

describe('detectAnomalies', () => {
  it('detects large outliers and preserves optional dates', () => {
    const result = detectAnomalies([10, 12, 11, 50], 1.5, ['a', 'b', 'c', 'd']);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ index: 3, value: 50, date: 'd' });
    expect(result[0].zScore).toBeGreaterThan(1.5);
  });

  it('returns an empty array for constant values', () => {
    expect(detectAnomalies([5, 5, 5, 5])).toEqual([]);
  });

  it('returns an empty array for fewer than three values', () => {
    expect(detectAnomalies([1, 100])).toEqual([]);
  });
});

describe('residualAnalysis', () => {
  it('computes predicted values, residuals, and mape', () => {
    const result = residualAnalysis([[1, 2, 3]], [3, 5, 8], [1, 2]);

    expect(result.predicted).toEqual([3, 5, 7]);
    expect(result.residuals).toEqual([0, 0, 1]);
    expect(result.mape).toBeCloseTo((1 / 8 / 3) * 100, 5);
  });

  it('returns zero mape when all targets are zero', () => {
    const result = residualAnalysis([[1, 2]], [0, 0], [0, 1]);
    expect(result.predicted).toEqual([1, 2]);
    expect(result.residuals).toEqual([-1, -2]);
    expect(result.mape).toBe(0);
  });

  it('handles empty inputs', () => {
    expect(residualAnalysis([], [], [0])).toEqual({ predicted: [], residuals: [], mape: 0 });
  });
});

describe('efficiencyFrontier', () => {
  it('returns the upper envelope after sorting by reads', () => {
    const result = efficiencyFrontier([300, 100, 200, 400], [20, 5, 25, 24]);
    expect(result).toEqual([
      { x: 100, y: 5 },
      { x: 200, y: 25 },
    ]);
  });

  it('filters out non-positive read counts', () => {
    const result = efficiencyFrontier([0, -5, 10], [100, 200, 50]);
    expect(result).toEqual([{ x: 10, y: 50 }]);
  });

  it('returns an empty array for empty input', () => {
    expect(efficiencyFrontier([], [])).toEqual([]);
  });
});

describe('percentileRanks', () => {
  it('computes percentile ranks for an ordered series', () => {
    expect(percentileRanks([10, 20, 30, 40])).toEqual([25, 50, 75, 100]);
  });

  it('assigns the same percentile to duplicate values', () => {
    expect(percentileRanks([10, 10, 30])).toEqual([66.66666666666666, 66.66666666666666, 100]);
  });

  it('returns an empty array for empty input', () => {
    expect(percentileRanks([])).toEqual([]);
  });
});
