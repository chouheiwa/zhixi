import { describe, it, expect } from 'vitest';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  multipleLinearRegression,
  elasticityAnalysis,
  contributionPercentages,
  laggedCorrelation,
  univariateLinearFit,
  partialCorrelation,
} from '@/shared/stats';

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly correlated data', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 5);
  });
  it('returns -1 for perfectly inversely correlated data', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 5);
  });
  it('returns 0 for constant data', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [5, 5, 5, 5, 5])).toBeCloseTo(0, 5);
  });
  it('returns 0 for arrays shorter than 2', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });
});

describe('spearmanCorrelation', () => {
  it('returns 1 for perfectly monotonic increasing', () => {
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 5);
  });
  it('returns 1 for non-linear but monotonic data', () => {
    // y = x^2 is monotonic increasing for positive x
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 5);
  });
  it('handles ties correctly', () => {
    const r = spearmanCorrelation([1, 2, 2, 3, 4], [10, 20, 20, 30, 40]);
    expect(r).toBeCloseTo(1, 5);
  });
  it('returns 0 for short arrays', () => {
    expect(spearmanCorrelation([1], [2])).toBe(0);
  });
});

describe('multipleLinearRegression (NNLS)', () => {
  it('fits a simple y = 2x relationship', () => {
    const result = multipleLinearRegression([[1, 2, 3, 4, 5]], [2, 4, 6, 8, 10]);
    expect(result.coefficients[0]).toBeCloseTo(0, 3);
    expect(result.coefficients[1]).toBeCloseTo(2, 3);
    expect(result.r2).toBeCloseTo(1, 5);
  });
  it('fits a multivariate relationship with positive coefficients', () => {
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 3, 2, 4];
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i]);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result.coefficients[1]).toBeCloseTo(2, 2);
    expect(result.coefficients[2]).toBeCloseTo(3, 2);
    expect(result.r2).toBeCloseTo(1, 3);
  });
  it('enforces non-negative feature coefficients', () => {
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const x2 = [1.1, 2.2, 2.9, 4.1, 5.0, 5.8, 7.1, 8.2];
    const y = x1.map((v) => 2 * v + 1);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result.coefficients[1]).toBeGreaterThanOrEqual(0);
    expect(result.coefficients[2]).toBeGreaterThanOrEqual(0);
    expect(result.r2).toBeGreaterThan(0.9);
  });
  it('handles insufficient data', () => {
    expect(multipleLinearRegression([[1], [2]], [3]).r2).toBe(0);
  });
});

describe('elasticityAnalysis', () => {
  it('returns elasticity ~1 for proportional relationship', () => {
    // y = 2x → ln(y) = ln(2) + 1*ln(x), elasticity = 1
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => 2 * v);
    const result = elasticityAnalysis([x], y);
    expect(result.elasticities[0]).toBeCloseTo(1, 1);
    expect(result.r2s[0]).toBeGreaterThan(0.95);
  });
  it('returns elasticity ~2 for quadratic relationship', () => {
    // y = x^2 → elasticity = 2
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => v * v);
    const result = elasticityAnalysis([x], y);
    expect(result.elasticities[0]).toBeCloseTo(2, 1);
  });
  it('skips zero values', () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = [0, 2, 4, 6, 8, 10];
    const result = elasticityAnalysis([x], y);
    expect(result.elasticities[0]).toBeCloseTo(1, 1);
  });
  it('handles all-zero data', () => {
    const result = elasticityAnalysis([[0, 0, 0]], [0, 0, 0]);
    expect(result.elasticities[0]).toBe(0);
  });
  it('reports nUsed / samplingFraction / totalN for each feature', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => 2 * v);
    const result = elasticityAnalysis([x], y);
    expect(result.totalN).toBe(8);
    expect(result.nUsed[0]).toBe(8);
    expect(result.samplingFraction[0]).toBeCloseTo(1, 5);
    expect(result.conditionalWarnings).toEqual([]);
  });

  it('produces a conditional warning when more than half the samples are dropped', () => {
    // 10 samples, only 3 valid (x > 0 AND y > 0) → samplingFraction = 0.3
    const x = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3];
    const y = [0, 0, 0, 0, 0, 0, 0, 2, 4, 6];
    const result = elasticityAnalysis([x], y);
    expect(result.totalN).toBe(10);
    expect(result.nUsed[0]).toBe(3);
    expect(result.samplingFraction[0]).toBeCloseTo(0.3, 3);
    expect(result.conditionalWarnings.length).toBe(1);
    expect(result.conditionalWarnings[0]).toMatch(/conditional/i);
  });

  it('does not warn when samplingFraction exceeds 50%', () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 0, 0, 0];
    const y = [0, 2, 4, 6, 8, 10, 12, 0, 0, 0];
    const result = elasticityAnalysis([x], y);
    expect(result.samplingFraction[0]).toBeGreaterThan(0.5);
    expect(result.conditionalWarnings).toEqual([]);
  });

  it('reports an insufficient-samples warning distinct from the conditional-elasticity warning', () => {
    // Only 1 valid sample pair → used < 3 → no fit, elasticities[0] = 0
    const x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5];
    const y = [0, 0, 0, 0, 0, 0, 0, 0, 0, 10];
    const result = elasticityAnalysis([x], y);
    expect(result.nUsed[0]).toBe(1);
    expect(result.elasticities[0]).toBe(0);
    expect(result.conditionalWarnings.length).toBe(1);
    expect(result.conditionalWarnings[0]).toMatch(/insufficient samples/i);
    expect(result.conditionalWarnings[0]).not.toMatch(/conditional on x > 0/i);
  });
});

describe('contributionPercentages', () => {
  it('returns feature + baseline percentages summing to 100', () => {
    const result = contributionPercentages(
      [0, 0.5, 0.3],
      [
        [10, 20, 30],
        [5, 10, 15],
      ],
    );
    const total = result.featurePercentages.reduce((a, b) => a + b, 0) + result.baselinePercentage;
    expect(total).toBeCloseTo(100, 3);
  });

  it('exposes absolute contributions and flags negative coefficients', () => {
    const result = contributionPercentages(
      [10, -0.1, 0.5],
      [
        [100, 100, 100],
        [50, 50, 50],
      ],
    );
    expect(result.hasNegativeCoefficients).toBe(true);
    expect(result.absoluteContributions.baseline).toBeCloseTo(10, 6);
    expect(result.absoluteContributions.features[0]).toBeCloseTo(-10, 6);
    expect(result.absoluteContributions.features[1]).toBeCloseTo(25, 6);
  });

  it('reports baseline percentage when intercept dominates', () => {
    // intercept=100, each feature contributes 0 → baseline 100%
    const result = contributionPercentages(
      [100, 0, 0],
      [
        [1, 2],
        [3, 4],
      ],
    );
    expect(result.baselinePercentage).toBeCloseTo(100, 3);
    expect(result.featurePercentages).toEqual([0, 0]);
  });

  it('handles zero total predicted income safely', () => {
    const result = contributionPercentages(
      [0, 0, 0],
      [
        [1, 2],
        [3, 4],
      ],
    );
    expect(result.featurePercentages).toEqual([0, 0]);
    expect(result.baselinePercentage).toBe(0);
    expect(result.hasNegativeCoefficients).toBe(false);
  });
});

describe('laggedCorrelation', () => {
  it('returns lag=0 as highest for instant correlation', () => {
    const metric = [1, 2, 3, 4, 5, 6, 7, 8];
    const income = [2, 4, 6, 8, 10, 12, 14, 16];
    const results = laggedCorrelation(metric, income, 2);
    expect(results[0].lag).toBe(0);
    expect(results[0].r).toBeCloseTo(1, 3);
  });
  it('detects lag=1 correlation', () => {
    // income[i] correlates with metric[i-1]
    const metric = [10, 1, 10, 1, 10, 1, 10, 1];
    const income = [0, 10, 1, 10, 1, 10, 1, 10]; // shifted by 1
    const results = laggedCorrelation(metric, income, 2);
    // lag=1 should have higher |r| than lag=0
    expect(Math.abs(results[1].r)).toBeGreaterThan(Math.abs(results[0].r));
  });
  it('returns results for each lag', () => {
    const results = laggedCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1], 3);
    expect(results).toHaveLength(4); // lag 0, 1, 2, 3
  });
});

describe('univariateLinearFit', () => {
  it('recovers exact slope and intercept on clean linear data', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 5, 7, 9, 11]; // y = 1 + 2x
    const fit = univariateLinearFit(x, y);
    expect(fit.slope).toBeCloseTo(2, 5);
    expect(fit.intercept).toBeCloseTo(1, 5);
    expect(fit.r2).toBeCloseTo(1, 5);
  });

  it('returns partial r² on noisy data', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v, i) => 2 * v + 1 + (i % 2 === 0 ? 0.5 : -0.5));
    const fit = univariateLinearFit(x, y);
    expect(fit.r2).toBeGreaterThan(0.95);
    expect(fit.r2).toBeLessThan(1);
  });

  it('handles zero-variance x without NaN', () => {
    const fit = univariateLinearFit([3, 3, 3, 3], [1, 2, 3, 4]);
    expect(fit.slope).toBe(0);
    expect(fit.r2).toBe(0);
    expect(fit.intercept).toBeCloseTo(2.5, 5); // mean(y)
  });

  it('handles insufficient data', () => {
    expect(univariateLinearFit([1], [2])).toEqual({ slope: 0, intercept: 0, r2: 0 });
  });
});

describe('partialCorrelation', () => {
  it('matches simple Pearson when z is uncorrelated with x and y', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => 2 * v + 1);
    // z is a shuffled sequence, weakly correlated with x
    const z = [5, 2, 8, 1, 6, 3, 7, 4];
    const partial = partialCorrelation(x, y, z);
    const raw = pearsonCorrelation(x, y);
    // Partial should still be high (x and y are perfectly linear regardless of z)
    expect(partial).toBeGreaterThan(0.9);
    expect(raw).toBeCloseTo(1, 5);
  });

  it('collapses to ~0 when x and y are both driven entirely by z', () => {
    // x ≈ 2z, y ≈ 3z → both just track z
    const z = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const x = z.map((v) => 2 * v);
    const y = z.map((v) => 3 * v + 1);
    const partial = partialCorrelation(x, y, z);
    expect(Math.abs(partial)).toBeLessThan(0.01);
  });

  it('returns 0 for zero-variance z', () => {
    expect(partialCorrelation([1, 2, 3, 4], [4, 5, 6, 7], [7, 7, 7, 7])).toBe(0);
  });
});
