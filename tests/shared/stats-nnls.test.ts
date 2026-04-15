import { describe, it, expect } from 'vitest';
import {
  bootstrapCoefficientCI,
  featureCorrelationMatrix,
  lawsonHansonNNLS,
  multipleLinearRegression,
} from '@/shared/stats';

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

describe('bootstrapCoefficientCI', () => {
  it('produces narrow CIs on clean linear data', () => {
    // y = 2·x1 + 3·x2
    const x1 = Array.from({ length: 60 }, (_, i) => (i % 10) + 1);
    const x2 = Array.from({ length: 60 }, (_, i) => ((i * 7) % 10) + 1);
    const y = x1.map((v, i) => 2 * v + 3 * x2[i]);
    const ci = bootstrapCoefficientCI([x1, x2], y, (xs, y2) => multipleLinearRegression(xs, y2), 50);
    // Medians close to ground truth (indexes 1, 2 — index 0 is intercept)
    expect(ci.median[1]).toBeCloseTo(2, 1);
    expect(ci.median[2]).toBeCloseTo(3, 1);
    // CI width should be small
    expect(ci.hi[1] - ci.lo[1]).toBeLessThan(0.5);
    expect(ci.hi[2] - ci.lo[2]).toBeLessThan(0.5);
    expect(ci.stability[1]).toBe('stable');
    expect(ci.stability[2]).toBe('stable');
  });

  it('tags features that are always zero as "dropped"', () => {
    // x3 is pure zero that NNLS will always eliminate
    const x1 = Array.from({ length: 40 }, (_, i) => i + 1);
    const x2 = Array.from({ length: 40 }, (_, i) => ((i * 3) % 8) + 1);
    const x3 = x1.map(() => 0); // always zero → always eliminated
    const y = x1.map((v, i) => 2 * v + x2[i]);
    const ci = bootstrapCoefficientCI([x1, x2, x3], y, (xs, y2) => multipleLinearRegression(xs, y2), 50);
    expect(ci.stability[3]).toBe('dropped');
  });

  it('tags unstable features (wide CI relative to median) as "unstable"', () => {
    // Two nearly collinear features with noisy y; NNLS oscillates which
    // one carries the weight across bootstrap samples. The noise is required
    // so the active-set algorithm actually has to choose between the two
    // columns — a perfectly-solvable problem would stay stable.
    const x1 = Array.from({ length: 50 }, (_, i) => i + 1);
    const x2 = x1.map((v) => v * 0.99 + Math.random() * 0.5);
    const y = x1.map((v, i) => v + x2[i] + (Math.random() - 0.5) * 5);
    const ci = bootstrapCoefficientCI([x1, x2], y, (xs, y2) => multipleLinearRegression(xs, y2), 100);
    const labels = [ci.stability[1], ci.stability[2]];
    expect(labels.some((s) => s === 'unstable' || s === 'dropped')).toBe(true);
  });

  it('reports successCount for each bootstrap run', () => {
    const x1 = Array.from({ length: 30 }, (_, i) => (i % 10) + 1);
    const x2 = Array.from({ length: 30 }, (_, i) => ((i * 7) % 10) + 1);
    const y = x1.map((v, i) => 2 * v + 3 * x2[i]);
    const B = 30;
    const ci = bootstrapCoefficientCI([x1, x2], y, (xs, y2) => multipleLinearRegression(xs, y2), B);
    // Happy path: all B iterations should succeed
    expect(ci.successCount).toBe(B);
  });

  it('degrades gracefully when regressionFn always throws', () => {
    const x1 = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const ci = bootstrapCoefficientCI(
      [x1],
      y,
      () => {
        throw new Error('always fails');
      },
      20,
    );
    expect(ci.successCount).toBe(0);
    // No samples → every coefficient tagged "dropped" via sorted.length === 0 path
    expect(ci.stability[0]).toBe('dropped');
    expect(ci.stability[1]).toBe('dropped');
  });

  it('respects the cvThreshold parameter for stable/unstable classification', () => {
    // Construct data with moderate noise so coefficients have a wide but not huge CI.
    const x1 = Array.from({ length: 40 }, (_, i) => i + 1);
    const y = x1.map((v) => 2 * v + (Math.random() - 0.5) * 5);
    const regressionFn = (xs: number[][], y2: number[]) => multipleLinearRegression(xs, y2);

    // Strict threshold — classification may be unstable
    const strict = bootstrapCoefficientCI([x1], y, regressionFn, 100, 0.95, 0.2);
    // Lenient threshold — same data, should be more likely stable
    const lenient = bootstrapCoefficientCI([x1], y, regressionFn, 100, 0.95, 2.0);

    // With a lenient threshold, the classification should never be stricter
    // than with a strict threshold (for the same data). Specifically, if strict
    // says 'stable', lenient must also say 'stable'.
    if (strict.stability[1] === 'stable') {
      expect(lenient.stability[1]).toBe('stable');
    }
    // And lenient should classify at least as many features stable as strict.
    const strictStable = strict.stability.filter((s) => s === 'stable').length;
    const lenientStable = lenient.stability.filter((s) => s === 'stable').length;
    expect(lenientStable).toBeGreaterThanOrEqual(strictStable);
  });
});

describe('featureCorrelationMatrix', () => {
  it('returns a symmetric p×p matrix with 1s on the diagonal', () => {
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [5, 4, 3, 2, 1];
    const x3 = [2, 2, 3, 4, 4];
    const m = featureCorrelationMatrix([x1, x2, x3]);
    expect(m.length).toBe(3);
    expect(m[0].length).toBe(3);
    // diagonal
    expect(m[0][0]).toBeCloseTo(1, 10);
    expect(m[1][1]).toBeCloseTo(1, 10);
    expect(m[2][2]).toBeCloseTo(1, 10);
    // symmetric
    expect(m[0][1]).toBeCloseTo(m[1][0], 10);
    expect(m[0][2]).toBeCloseTo(m[2][0], 10);
    // x1 vs x2 perfectly anti-correlated
    expect(m[0][1]).toBeCloseTo(-1, 5);
  });

  it('reports |r| > 0.9 for highly collinear features', () => {
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const x2 = x1.map((v) => v * 2 + 0.01);
    const m = featureCorrelationMatrix([x1, x2]);
    expect(Math.abs(m[0][1])).toBeGreaterThan(0.99);
  });

  it('returns empty matrix for empty input', () => {
    expect(featureCorrelationMatrix([])).toEqual([]);
  });
});
