import { describe, it, expect } from 'vitest';
import { lawsonHansonNNLS } from '@/shared/stats';

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
});
