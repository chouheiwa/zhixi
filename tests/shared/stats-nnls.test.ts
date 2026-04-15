import { describe, it, expect } from 'vitest';
import { lawsonHansonNNLS, multipleLinearRegression } from '@/shared/stats';

describe('lawsonHansonNNLS', () => {
  // Test 1: known closed-form solution y = 2·x1 + 3·x2
  it('finds the exact solution for a clean linear problem', () => {
    const xs = [
      [1, 0, 1, 2], // x1
      [0, 1, 1, 1], // x2
    ];
    const y = [2, 3, 5, 7];
    const result = lawsonHansonNNLS(xs, y);
    expect(result.coefficients[0]).toBeCloseTo(0, 3);
    expect(result.coefficients[1]).toBeCloseTo(2, 3);
    expect(result.coefficients[2]).toBeCloseTo(3, 3);
    expect(result.r2).toBeCloseTo(1, 5);
  });

  // Test 2: OLS would give a negative coefficient → NNLS must constrain
  it('clips features whose OLS coefficient would be negative', () => {
    const xs = [
      [1, 0, 1, 2], // x1
      [0, 1, 1, 1], // x2
    ];
    // y ≈ x1 - x2 → unconstrained OLS would give negative x2 coefficient
    const y = [1, -1, 0, 1];
    const result = lawsonHansonNNLS(xs, y);
    expect(result.coefficients[2]).toBeCloseTo(0, 5);
    expect(result.coefficients[1]).toBeGreaterThanOrEqual(-1e-9);
    expect(result.r2).toBeGreaterThan(0.5);
  });

  // Test 3: multicollinearity x1 ≈ x2, y = 2·x1
  it('stays stable under multicollinearity', () => {
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const x2 = x1.map((v) => v + 1e-6); // nearly perfectly collinear
    const y = x1.map((v) => 2 * v);
    const result = lawsonHansonNNLS([x1, x2], y);
    const sum = result.coefficients[1] + result.coefficients[2];
    expect(sum).toBeGreaterThan(1.5);
    expect(sum).toBeLessThan(2.5);
    expect(result.r2).toBeGreaterThan(0.99);
  });

  it('returns zero coefficients for insufficient data', () => {
    const result = lawsonHansonNNLS([[1]], [1]);
    expect(result.coefficients).toEqual([0, 0]);
    expect(result.r2).toBe(0);
    expect(result.iterations).toBe(0);
  });
});

describe('multipleLinearRegression (backward-compat wrapper)', () => {
  it('still exposes { coefficients, r2 }', () => {
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 3, 2, 4];
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i]);
    const result = multipleLinearRegression([x1, x2], y);
    expect(result).toHaveProperty('coefficients');
    expect(result).toHaveProperty('r2');
    expect(result.coefficients.length).toBe(3); // intercept + 2 features
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
  });
});
