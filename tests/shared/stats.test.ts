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

describe('multipleLinearRegression', () => {
  it('fits a simple y = 2x relationship', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const result = multipleLinearRegression([x], y);
    expect(result.coefficients[0]).toBeCloseTo(0, 3); // intercept
    expect(result.coefficients[1]).toBeCloseTo(2, 3); // slope
    expect(result.r2).toBeCloseTo(1, 5);
  });

  it('fits a multivariate relationship', () => {
    // y = 1 + 2*x1 + 3*x2
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 3, 2, 4];
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i]);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result.coefficients[0]).toBeCloseTo(1, 2); // intercept
    expect(result.coefficients[1]).toBeCloseTo(2, 2); // x1
    expect(result.coefficients[2]).toBeCloseTo(3, 2); // x2
    expect(result.r2).toBeCloseTo(1, 3);
  });

  it('handles insufficient data', () => {
    const result = multipleLinearRegression([[1], [2]], [3]);
    expect(result.r2).toBe(0);
  });
});
