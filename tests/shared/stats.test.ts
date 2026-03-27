import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, multipleLinearRegression } from '@/shared/stats';

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly correlated data', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBeCloseTo(1, 5);
  });

  it('returns -1 for perfectly inversely correlated data', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1, 5);
  });

  it('returns 0 for uncorrelated data', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [5, 5, 5, 5, 5]);
    expect(r).toBeCloseTo(0, 5);
  });

  it('returns 0 for arrays shorter than 2', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });
});

describe('multipleLinearRegression (NNLS)', () => {
  it('fits a simple y = 2x relationship', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const result = multipleLinearRegression([x], y);
    expect(result.coefficients[0]).toBeCloseTo(0, 3);
    expect(result.coefficients[1]).toBeCloseTo(2, 3);
    expect(result.r2).toBeCloseTo(1, 5);
  });

  it('fits a multivariate relationship with positive coefficients', () => {
    // y = 1 + 2*x1 + 3*x2
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 3, 2, 4];
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i]);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result.coefficients[0]).toBeCloseTo(1, 2);
    expect(result.coefficients[1]).toBeCloseTo(2, 2);
    expect(result.coefficients[2]).toBeCloseTo(3, 2);
    expect(result.r2).toBeCloseTo(1, 3);
  });

  it('enforces non-negative feature coefficients', () => {
    // OLS with correlated features can produce negative coefficients
    // NNLS should ensure all feature coefficients >= 0
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const x2 = [1.1, 2.2, 2.9, 4.1, 5.0, 5.8, 7.1, 8.2]; // correlated with x1 but not identical
    const y = x1.map(v => 2 * v + 1);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result.coefficients[1]).toBeGreaterThanOrEqual(0);
    expect(result.coefficients[2]).toBeGreaterThanOrEqual(0);
    expect(result.r2).toBeGreaterThan(0.9);
  });

  it('handles insufficient data', () => {
    const result = multipleLinearRegression([[1], [2]], [3]);
    expect(result.r2).toBe(0);
  });
});
