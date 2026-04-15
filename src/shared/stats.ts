/**
 * Pearson correlation coefficient between two arrays.
 * Returns a value between -1 and 1.
 * Returns 0 if either array has zero variance.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Non-negative multiple linear regression.
 *
 * Fits: y = b0 + b1*x1 + b2*x2 + ... + bn*xn  where b1..bn >= 0
 * (intercept b0 is unconstrained).
 *
 * Internally delegates to {@link lawsonHansonNNLS}, which uses the Lawson-Hanson
 * active-set method and is guaranteed to find the KKT-optimal constrained
 * solution. The old iterative-elimination heuristic was replaced in 2026-04.
 *
 * ⚠️ Multicollinearity caveat: with highly correlated features (|r| > 0.7), the
 * non-zero coefficients are sample-sensitive — the same data cut differently
 * (e.g. 5-fold CV) can produce very different per-feature answers. UIs that
 * display these coefficients SHOULD also call {@link bootstrapCoefficientCI}
 * and {@link featureCorrelationMatrix} so users see the instability.
 *
 * @param xs - Array of feature arrays, each feature is a number[]
 * @param y - Target array
 * @returns coefficients [b0, b1, b2, ...bn] and r2 score
 */
export function multipleLinearRegression(xs: number[][], y: number[]): { coefficients: number[]; r2: number } {
  const result = lawsonHansonNNLS(xs, y);
  return { coefficients: result.coefficients, r2: result.r2 };
}

/** OLS fit with intercept. Returns [b0, b1, ...] or null if singular. */
function olsFit(xs: number[][], y: number[]): number[] | null {
  const n = y.length;
  const p = xs.length;
  const cols = p + 1;

  const XtX: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const Xty: number[] = new Array(cols).fill(0);

  for (let i = 0; i < n; i++) {
    const row = [1, ...xs.map((x) => x[i])];
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < cols; k++) {
        XtX[j][k] += row[j] * row[k];
      }
      Xty[j] += row[j] * y[i];
    }
  }

  return solveLinearSystem(XtX, Xty);
}

/**
 * Lawson-Hanson non-negative least squares.
 * Solves: min ||Ax - b||² s.t. x >= 0
 *
 * Guaranteed to find the global optimum of the constrained problem.
 * Unlike the iterative-elimination heuristic in the original
 * multipleLinearRegression, this algorithm:
 *   1. Uses an active set method with exchange rule
 *   2. Verifies KKT conditions at convergence
 *   3. Allows dropped features to re-enter the active set
 *
 * Reference: Lawson, C.L. and Hanson, R.J. (1974)
 *   Solving Least Squares Problems, SIAM.
 *
 * @param xs - Feature arrays (each entry is one feature column)
 * @param y - Target array
 * @returns coefficients [b0, b1, ...] with b1..bn >= 0, r2, and the number of
 *   outer active-set iterations performed (inner interpolation steps are not
 *   counted).
 */
export function lawsonHansonNNLS(
  xs: number[][],
  y: number[],
  maxIter: number = 1000,
  tol: number = 1e-10,
): { coefficients: number[]; r2: number; iterations: number } {
  const n = y.length;
  const p = xs.length;
  if (n < 2) return { coefficients: new Array(p + 1).fill(0), r2: 0, iterations: 0 };

  // Build design matrix A (n × (p+1)) with leading intercept column.
  // The intercept is treated as an unconstrained column: we put it in P
  // permanently so it is never dropped. All other columns start in R and are
  // activated by the standard Lawson-Hanson rule.
  const m = p + 1;
  const A: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array(m);
    row[0] = 1;
    for (let j = 0; j < p; j++) row[j + 1] = xs[j][i];
    A[i] = row;
  }

  const x = new Array(m).fill(0);
  const P = new Set<number>([0]); // intercept always active
  const R = new Set<number>();
  for (let j = 1; j < m; j++) R.add(j);

  const matVec = (M: number[][], v: number[]): number[] => {
    const out = new Array(M.length).fill(0);
    for (let i = 0; i < M.length; i++) {
      for (let k = 0; k < v.length; k++) out[i] += M[i][k] * v[k];
    }
    return out;
  };
  const matTVec = (M: number[][], v: number[]): number[] => {
    const cols = M[0].length;
    const out = new Array(cols).fill(0);
    for (let k = 0; k < cols; k++) {
      for (let i = 0; i < M.length; i++) out[k] += M[i][k] * v[i];
    }
    return out;
  };

  // Solve unconstrained least squares on the submatrix given by `active` columns.
  const solveActiveOLS = (active: number[]): number[] => {
    const k = active.length;
    const AtA: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const Atb: number[] = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < k; a++) {
        for (let c = 0; c < k; c++) AtA[a][c] += A[i][active[a]] * A[i][active[c]];
        Atb[a] += A[i][active[a]] * y[i];
      }
    }
    const sol = solveLinearSystem(AtA, Atb);
    // If the active subsystem is singular (e.g. duplicate columns), fall back to
    // the zero vector. The inner feasibility check will then drop all active
    // feature columns back to R, letting the outer loop pick a different jMax.
    return sol ?? new Array(k).fill(0);
  };

  let outerIterations = 0;
  while (outerIterations < maxIter) {
    outerIterations++;
    const Ax = matVec(A, x);
    const resid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) resid[i] = y[i] - Ax[i];
    const w = matTVec(A, resid);

    // Find the most promising column in R (largest positive gradient).
    let jMax = -1;
    let wMax = tol;
    for (const j of R) {
      if (w[j] > wMax) {
        wMax = w[j];
        jMax = j;
      }
    }
    if (jMax === -1) break; // w_j <= tol for all j in R → KKT satisfied

    R.delete(jMax);
    P.add(jMax);

    // Inner loop: resolve infeasibility introduced by adding jMax to P.
    // Bound: Lawson-Hanson's inner loop cannot exceed the number of columns,
    // so `m + 1` is a safe upper bound per outer step.
    let innerIterations = 0;
    const maxInner = m + 1;
    while (innerIterations < maxInner) {
      innerIterations++;
      const active = [...P].sort((a, b) => a - b);
      const s = solveActiveOLS(active);

      // Intercept (index 0) is unconstrained; only feature columns must be > 0.
      // Standard Lawson-Hanson uses strict feasibility (s_i <= 0), NOT a
      // tolerance — a tiny positive coefficient like 1e-11 is a legitimate
      // feasible solution and must not be clamped.
      let anyInfeasible = false;
      for (let i = 0; i < active.length; i++) {
        if (active[i] !== 0 && s[i] <= 0) {
          anyInfeasible = true;
          break;
        }
      }

      if (!anyInfeasible) {
        for (let i = 0; i < active.length; i++) x[active[i]] = s[i];
        for (const j of R) x[j] = 0;
        break;
      }

      // Interpolate: find step α ∈ (0, 1] that keeps x ≥ 0 on feature columns.
      let alpha = 1;
      for (let i = 0; i < active.length; i++) {
        const col = active[i];
        if (col === 0) continue;
        if (s[i] <= 0) {
          const denom = x[col] - s[i];
          if (denom > tol) {
            const candidate = x[col] / denom;
            if (candidate < alpha) alpha = candidate;
          }
        }
      }

      for (let i = 0; i < active.length; i++) {
        const col = active[i];
        x[col] = x[col] + alpha * (s[i] - x[col]);
      }

      // Move all x_j ≤ 0 (among feature columns) from P back to R.
      const toRemove: number[] = [];
      for (const j of P) {
        if (j !== 0 && x[j] <= 0) toRemove.push(j);
      }
      for (const j of toRemove) {
        P.delete(j);
        R.add(j);
        x[j] = 0;
      }
    }
  }

  // R² on original scale
  let yMean = 0;
  for (let i = 0; i < n; i++) yMean += y[i];
  yMean /= n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let pred = x[0];
    for (let j = 0; j < p; j++) pred += x[j + 1] * xs[j][i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { coefficients: [...x], r2, iterations: outerIterations };
}

/** Stability label returned by {@link bootstrapCoefficientCI}. */
export type StabilityLabel = 'stable' | 'unstable' | 'dropped';

/**
 * Bootstrap confidence intervals for regression coefficients.
 *
 * Runs the regression B times on data resampled with replacement and returns
 * the sampling distribution of each coefficient (including the intercept at
 * index 0) as (lo, median, hi) percentiles plus a stability tag.
 *
 * Use this to communicate coefficient uncertainty to users before showing a
 * single point estimate. Critical under multicollinearity, where NNLS point
 * estimates are highly sample-sensitive.
 *
 * Stability classification:
 *  - `dropped`: the coefficient is 0 in ≥ 95% of resamples
 *  - `stable`:  |median| > 0 and (hi - lo) / |median| < 0.5
 *  - `unstable`: neither of the above
 *
 * The intercept column (index 0) is always tagged `'stable'` — its stability
 * is not meaningful in the same sense as feature columns.
 *
 * @param xs - Feature arrays
 * @param y  - Target array
 * @param regressionFn - Regression function returning { coefficients, r2 }
 * @param B  - Number of bootstrap iterations (default 200)
 * @param ciLevel - Confidence level in (0, 1), default 0.95
 *
 * @remarks
 * Performance: each iteration calls `regressionFn` on a fresh resampled dataset.
 * For B=200 with n >= 1000 rows and p >= 5 features using Lawson-Hanson NNLS,
 * synchronous execution can take 200-500ms on a modern laptop — enough to drop
 * animation frames. For dashboard use, consider running in a Web Worker or
 * lowering B.
 */
export function bootstrapCoefficientCI(
  xs: number[][],
  y: number[],
  regressionFn: (xs: number[][], y: number[]) => { coefficients: number[]; r2: number },
  B: number = 200,
  ciLevel: number = 0.95,
): {
  lo: number[];
  median: number[];
  hi: number[];
  stability: StabilityLabel[];
  successCount: number;
} {
  const n = y.length;
  const p = xs.length;
  const m = p + 1;
  if (n < 2 || p === 0) {
    return {
      lo: new Array(m).fill(0),
      median: new Array(m).fill(0),
      hi: new Array(m).fill(0),
      stability: new Array(m).fill('dropped'),
      successCount: 0,
    };
  }

  // samples[j] collects the j-th coefficient across B resamples
  const samples: number[][] = Array.from({ length: m }, () => []);

  let successCount = 0;
  for (let b = 0; b < B; b++) {
    const resampledXs: number[][] = xs.map(() => new Array(n));
    const resampledY: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      for (let j = 0; j < p; j++) resampledXs[j][i] = xs[j][idx];
      resampledY[i] = y[idx];
    }

    let result: { coefficients: number[]; r2: number };
    try {
      result = regressionFn(resampledXs, resampledY);
    } catch {
      continue;
    }
    successCount++;
    for (let j = 0; j < m; j++) samples[j].push(result.coefficients[j] ?? 0);
  }

  const alpha = (1 - ciLevel) / 2;
  const lo = new Array(m).fill(0);
  const median = new Array(m).fill(0);
  const hi = new Array(m).fill(0);
  const stability: StabilityLabel[] = new Array(m).fill('dropped');

  for (let j = 0; j < m; j++) {
    const sorted = [...samples[j]].sort((a, b) => a - b);
    if (sorted.length === 0) {
      stability[j] = 'dropped';
      continue;
    }
    const loIdx = Math.max(0, Math.floor(alpha * sorted.length));
    const hiIdx = Math.min(sorted.length - 1, Math.ceil((1 - alpha) * sorted.length) - 1);
    const medIdx = Math.floor(sorted.length / 2);
    lo[j] = sorted[loIdx];
    median[j] = sorted[medIdx];
    hi[j] = sorted[hiIdx];

    if (j === 0) {
      // Intercept: stability is not meaningful in the same sense; always tag stable
      stability[j] = 'stable';
      continue;
    }

    // A feature is "effectively dropped" if ≥95% of bootstrap resamples zero it
    // out — the conventional bootstrap threshold for treating a coefficient as
    // consistently eliminated by the active-set solver.
    const zeroFraction = sorted.filter((v) => Math.abs(v) < 1e-9).length / sorted.length;
    if (zeroFraction >= 0.95) {
      stability[j] = 'dropped';
    } else if (
      Math.abs(median[j]) > 1e-9 &&
      // A CI width of less than 50% of the median magnitude is a "tight enough"
      // heuristic for bootstrap stability — below this the point estimate
      // communicates meaningful information about the underlying parameter.
      (hi[j] - lo[j]) / Math.abs(median[j]) < 0.5
    ) {
      stability[j] = 'stable';
    } else {
      stability[j] = 'unstable';
    }
  }

  return { lo, median, hi, stability, successCount };
}

/**
 * Pairwise Pearson correlation matrix between features.
 * Returns a p×p symmetric matrix where entry [i][j] = corr(xs[i], xs[j]).
 * The diagonal is always 1. Useful for diagnosing multicollinearity before
 * interpreting multivariate regression coefficients — when any off-diagonal
 * |r| > 0.7, the corresponding regression coefficients should be considered
 * sample-sensitive and reported alongside {@link bootstrapCoefficientCI}.
 */
export function featureCorrelationMatrix(xs: number[][]): number[][] {
  const p = xs.length;
  const M: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    M[i][i] = 1;
    for (let j = i + 1; j < p; j++) {
      const r = pearsonCorrelation(xs[i], xs[j]);
      M[i][j] = r;
      M[j][i] = r;
    }
  }
  return M;
}

/**
 * Spearman rank correlation coefficient.
 * Measures monotonic (not necessarily linear) relationship.
 * Computed as Pearson correlation of ranked values.
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length < 2) return 0;
  return pearsonCorrelation(rankArray(x), rankArray(y));
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j + 1) / 2; // average rank for ties
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

/**
 * Result of {@link elasticityAnalysis}.
 *
 * Fields `nUsed`, `totalN`, `samplingFraction`, and `conditionalWarnings` were
 * added in 2026-04 to expose the selection bias caused by the log-log filter
 * (log undefined at 0, so all (x ≤ 0 or y ≤ 0) samples are dropped). Features
 * with high zero-rates produce a conditional elasticity, not a marginal one.
 */
export interface ElasticityResult {
  elasticities: number[];
  r2s: number[];
  /** Sample count per feature after dropping x<=0 or y<=0 pairs. */
  nUsed: number[];
  /** Total sample count in the input (same across features). */
  totalN: number;
  /** nUsed[i] / totalN — fraction of samples retained per feature. */
  samplingFraction: number[];
  /**
   * Human-readable warnings, one per feature where `samplingFraction[i] < 0.5`.
   * Warnings are push-ordered by feature index; features without warnings are
   * skipped, so the array is NOT index-aligned with `elasticities`. Each entry
   * begins with `"Feature ${i}: "` so callers can recover the source feature.
   */
  conditionalWarnings: string[];
}

/**
 * Log-log elasticity regression.
 * Fits: ln(y) = a + b*ln(x) for each feature independently.
 * b = "x increases 1% → y increases b%"
 *
 * Samples where x ≤ 0 or y ≤ 0 are dropped (log undefined). For features with
 * high zero-rate this introduces selection bias: the returned elasticity is
 * conditional on x>0, not a marginal effect on the full distribution. Inspect
 * `samplingFraction` and `conditionalWarnings` before making decisions.
 */
export function elasticityAnalysis(xs: number[][], y: number[]): ElasticityResult {
  const elasticities: number[] = [];
  const r2s: number[] = [];
  const nUsed: number[] = [];
  const totalN = y.length;
  const samplingFraction: number[] = [];
  const conditionalWarnings: string[] = [];

  for (let featureIdx = 0; featureIdx < xs.length; featureIdx++) {
    const x = xs[featureIdx];
    const validIndices: number[] = [];
    for (let i = 0; i < x.length; i++) {
      if (x[i] > 0 && y[i] > 0) validIndices.push(i);
    }
    const used = validIndices.length;
    nUsed.push(used);
    samplingFraction.push(totalN > 0 ? used / totalN : 0);

    if (used < 3) {
      elasticities.push(0);
      r2s.push(0);
      continue;
    }

    const logX = validIndices.map((i) => Math.log(x[i]));
    const logY = validIndices.map((i) => Math.log(y[i]));
    const result = olsFit([logX], logY);
    if (!result) {
      elasticities.push(0);
      r2s.push(0);
      continue;
    }

    elasticities.push(result[1]);

    let mean = 0;
    for (const v of logY) mean += v;
    mean /= logY.length;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < logY.length; i++) {
      const predicted = result[0] + result[1] * logX[i];
      ssRes += (logY[i] - predicted) ** 2;
      ssTot += (logY[i] - mean) ** 2;
    }
    r2s.push(ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot));
  }

  for (let i = 0; i < xs.length; i++) {
    if (samplingFraction[i] >= 0.5) continue;
    const pct = (samplingFraction[i] * 100).toFixed(0);
    if (nUsed[i] < 3) {
      conditionalWarnings.push(
        `Feature ${i}: insufficient samples (${nUsed[i]}/${totalN}, ${pct}%). ` +
          `Elasticity was not fit and is reported as 0. At least 3 (x>0, y>0) ` +
          `pairs are required for a log-log regression.`,
      );
    } else {
      conditionalWarnings.push(
        `Feature ${i}: only ${nUsed[i]}/${totalN} samples used (${pct}%). ` +
          `Elasticity ${elasticities[i].toFixed(3)} is conditional on x > 0, ` +
          `not a marginal effect. Interpret with caution.`,
      );
    }
  }

  return { elasticities, r2s, nUsed, totalN, samplingFraction, conditionalWarnings };
}

/**
 * Decomposition of predicted mean income into feature and baseline contributions.
 * Returned by {@link contributionPercentages}.
 */
export interface ContributionBreakdown {
  /** Per-feature contribution as a percentage of predicted mean income. */
  featurePercentages: number[];
  /** Intercept (baseline) contribution as a percentage of predicted mean income. */
  baselinePercentage: number;
  /** Raw decomposition: intercept + Σ β_i · mean(x_i), in original y units. */
  absoluteContributions: { baseline: number; features: number[] };
  /** True if any feature coefficient is negative (indicates non-NNLS input). */
  hasNegativeCoefficients: boolean;
}

/**
 * Decompose the regression's predicted mean into per-feature and baseline
 * contributions. Unlike the old version, this exposes the intercept as a
 * first-class "baseline" so users can see the portion of predicted income that
 * is NOT explained by any interaction feature.
 *
 * The returned percentages always sum to 100 (up to floating-point error) because
 * they partition `totalPredicted`. However, when `hasNegativeCoefficients` is true,
 * individual percentages can fall outside [0, 100] (e.g. a feature with a negative
 * contribution may show as -40% while another shows as 140%). Callers should
 * surface this to users and prefer `absoluteContributions` for any
 * numerically-sensitive display.
 */
export function contributionPercentages(coefficients: number[], xs: number[][]): ContributionBreakdown {
  const p = xs.length;
  const intercept = coefficients[0] ?? 0;
  const means = xs.map((x) => (x.length > 0 ? x.reduce((a, b) => a + b, 0) / x.length : 0));
  const featureContribs = means.map((m, i) => (coefficients[i + 1] ?? 0) * m);
  const hasNeg = featureContribs.some((c) => c < 0);

  const totalPredicted = intercept + featureContribs.reduce((a, b) => a + b, 0);

  // Guard against (a) exact zero and (b) catastrophic cancellation where
  // |totalPredicted| is tiny relative to the magnitude of the components.
  // Without this, opposing-sign contributions that nearly cancel would produce
  // astronomical percentages (e.g. 10^6 fen / 0.01 fen = 10^8 %).
  const componentMagnitude = Math.abs(intercept) + featureContribs.reduce((a, b) => a + Math.abs(b), 0);
  const CANCELLATION_RATIO = 1e-6;
  if (totalPredicted === 0 || Math.abs(totalPredicted) < componentMagnitude * CANCELLATION_RATIO) {
    return {
      featurePercentages: new Array(p).fill(0),
      baselinePercentage: 0,
      absoluteContributions: { baseline: intercept, features: featureContribs },
      hasNegativeCoefficients: hasNeg,
    };
  }

  return {
    featurePercentages: featureContribs.map((c) => (c / totalPredicted) * 100),
    baselinePercentage: (intercept / totalPredicted) * 100,
    absoluteContributions: { baseline: intercept, features: featureContribs },
    hasNegativeCoefficients: hasNeg,
  };
}

/**
 * Time-lagged correlation.
 * Shifts metric forward by `lag` days and computes Pearson correlation with income.
 * e.g. lag=1: does today's metric correlate with tomorrow's income?
 */
export function laggedCorrelation(
  metric: number[],
  income: number[],
  maxLag: number = 3,
): { lag: number; r: number }[] {
  const results: { lag: number; r: number }[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    if (metric.length - lag < 3) {
      results.push({ lag, r: 0 });
      continue;
    }
    // metric[0..n-lag-1] vs income[lag..n-1]
    const m = metric.slice(0, metric.length - lag);
    const y = income.slice(lag);
    results.push({ lag, r: pearsonCorrelation(m, y) });
  }
  return results;
}

// ── RPM ──

export function computeRPM(income: number, reads: number): number {
  return reads > 0 ? (income / reads) * 1000 : 0;
}

// ── Simple Moving Average ──

export function simpleMovingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      if (values[j] != null) {
        sum += values[j]!;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

// ── Exponential Moving Average ──

export function ema(values: number[], span: number): number[] {
  if (values.length === 0) return [];
  const alpha = 2 / (span + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

// ── Holt Double Exponential Smoothing + Forecast ──

export function holtForecast(
  values: number[],
  alpha = 0.3,
  beta = 0.1,
  horizon = 7,
): { smoothed: number[]; forecast: number[] } {
  if (values.length < 2) return { smoothed: [...values], forecast: [] };
  let level = values[0];
  let trend = values[1] - values[0];
  const smoothed = [level];
  for (let i = 1; i < values.length; i++) {
    const newLevel = alpha * values[i] + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
    trend = newTrend;
    smoothed.push(level);
  }
  const forecast: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    forecast.push(Math.max(0, level + h * trend));
  }
  return { smoothed, forecast };
}

// ── Weekly Seasonality Decomposition ──

export function weeklySeasonality(
  dates: string[],
  values: number[],
): { dayOfWeek: number; avg: number; count: number }[] {
  const buckets = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, sum: 0, count: 0 }));
  for (let i = 0; i < dates.length; i++) {
    const dow = new Date(dates[i]).getDay();
    buckets[dow].sum += values[i];
    buckets[dow].count++;
  }
  return buckets.map((b) => ({
    dayOfWeek: b.dayOfWeek,
    avg: b.count > 0 ? b.sum / b.count : 0,
    count: b.count,
  }));
}

// ── Exponential Decay Fit: income(t) = A * e^(-λt) ──

export function exponentialDecayFit(
  values: number[],
): { A: number; lambda: number; halfLife: number; ltv: number; r2: number } | null {
  // Filter positive values, use index as t
  const valid: { t: number; v: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) valid.push({ t: i, v: values[i] });
  }
  if (valid.length < 3) return null;

  const logY = valid.map((p) => Math.log(p.v));
  const ts = valid.map((p) => p.t);
  const result = olsFit([ts], logY);
  if (!result) return null;

  const A = Math.exp(result[0]);
  const lambda = -result[1];
  if (lambda <= 0) return null; // not decaying

  const halfLife = Math.LN2 / lambda;
  const ltv = A / lambda;

  // R²
  let mean = 0;
  for (const v of logY) mean += v;
  mean /= logY.length;
  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < logY.length; i++) {
    const pred = result[0] + result[1] * ts[i];
    ssRes += (logY[i] - pred) ** 2;
    ssTot += (logY[i] - mean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { A, lambda, halfLife, ltv, r2 };
}

// ── Power Law Decay Fit: income(t) = A * t^(-α) ──

export function powerLawDecayFit(values: number[]): { A: number; alpha: number; r2: number } | null {
  // Use t starting from 1 (avoid log(0))
  const valid: { t: number; v: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) valid.push({ t: i + 1, v: values[i] });
  }
  if (valid.length < 3) return null;

  const logT = valid.map((p) => Math.log(p.t));
  const logY = valid.map((p) => Math.log(p.v));
  const result = olsFit([logT], logY);
  if (!result) return null;

  const A = Math.exp(result[0]);
  const alpha = -result[1];

  let mean = 0;
  for (const v of logY) mean += v;
  mean /= logY.length;
  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < logY.length; i++) {
    const pred = result[0] + result[1] * logT[i];
    ssRes += (logY[i] - pred) ** 2;
    ssTot += (logY[i] - mean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { A, alpha, r2 };
}

// ── Early Performance Multiplier ──

export function earlyPerformanceMultiplier(
  contentIncomes: { firstNDays: number; total: number }[],
  _n: number,
): { multiplier: number; sampleSize: number } {
  const valid = contentIncomes.filter((c) => c.firstNDays > 0 && c.total > 0);
  if (valid.length === 0) return { multiplier: 0, sampleSize: 0 };
  const ratios = valid.map((c) => c.total / c.firstNDays);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { multiplier: avg, sampleSize: valid.length };
}

// ── Ridge Regression: minimize ||y - Xβ||² + λ||β||² ──
//
// Features are z-score standardized internally so the penalty λ applies
// uniformly across feature scales; coefficients are then un-standardized
// before being returned. λ is interpreted on the standardized scale:
//   λ = 0   → equivalent to OLS
//   λ = 1   → mild regularization (1 unit of L2 per standardized feature)
//   λ = 100 → strong shrinkage

export function ridgeRegression(xs: number[][], y: number[], lambda = 1.0): { coefficients: number[]; r2: number } {
  const n = y.length;
  const p = xs.length;
  const cols = p + 1;
  if (n < 2) return { coefficients: new Array(cols).fill(0), r2: 0 };

  // Step 1: compute feature means and stds
  const means = xs.map((x) => x.reduce((a, b) => a + b, 0) / n);
  const stds = xs.map((x, i) => {
    let variance = 0;
    for (const v of x) variance += (v - means[i]) ** 2;
    variance /= n;
    const s = Math.sqrt(variance);
    return s > 1e-12 ? s : 1; // protect against zero-variance features
  });

  // Step 2: standardize features
  const xsStd = xs.map((x, i) => x.map((v) => (v - means[i]) / stds[i]));

  // Step 3: build standardized XtX / Xty with intercept column
  const XtX: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const Xty: number[] = new Array(cols).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...xsStd.map((x) => x[i])];
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < cols; k++) XtX[j][k] += row[j] * row[k];
      Xty[j] += row[j] * y[i];
    }
  }

  // Step 4: apply ridge penalty on standardized feature columns only
  for (let j = 1; j < cols; j++) XtX[j][j] += lambda;

  const stdCoeffs = solveLinearSystem(XtX, Xty);
  if (!stdCoeffs) return { coefficients: new Array(cols).fill(0), r2: 0 };

  // Step 5: un-standardize
  // Standardized model: y = b0_std + Σ b_j_std * (x_j - mean_j) / std_j
  //                       = (b0_std - Σ b_j_std * mean_j / std_j) + Σ (b_j_std / std_j) * x_j
  const finalCoeffs = new Array(cols).fill(0);
  let intercept = stdCoeffs[0];
  for (let j = 0; j < p; j++) {
    finalCoeffs[j + 1] = stdCoeffs[j + 1] / stds[j];
    intercept -= (stdCoeffs[j + 1] * means[j]) / stds[j];
  }
  finalCoeffs[0] = intercept;

  // Step 6: R² on original scale
  let yMean = 0;
  for (let i = 0; i < n; i++) yMean += y[i];
  yMean /= n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let pred = finalCoeffs[0];
    for (let j = 0; j < p; j++) pred += finalCoeffs[j + 1] * xs[j][i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  return { coefficients: finalCoeffs, r2: ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot) };
}

// ── Interaction Terms Regression ──

export function interactionRegression(
  xs: number[][],
  y: number[],
  labels: string[],
): { terms: { name: string; coeff: number }[]; r2: number } {
  // Build features: original + pairwise interactions
  const allXs: number[][] = [...xs];
  const termNames = [...labels];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      allXs.push(xs[i].map((v, k) => v * xs[j][k]));
      termNames.push(`${labels[i]}×${labels[j]}`);
    }
  }

  const result = ridgeRegression(allXs, y, 0.5);
  const terms = termNames
    .map((name, i) => ({
      name,
      coeff: result.coefficients[i + 1],
    }))
    .sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));

  return { terms, r2: result.r2 };
}

// ── Quantile Regression (iteratively reweighted least squares) ──

export function quantileRegression(xs: number[][], y: number[], tau: number, maxIter = 20): number[] {
  const n = y.length;
  const p = xs.length;
  if (n < 2) return new Array(p + 1).fill(0);

  // Start with OLS
  let beta = olsFit(xs, y);
  if (!beta) return new Array(p + 1).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const weights: number[] = [];
    for (let i = 0; i < n; i++) {
      let pred = beta[0];
      for (let j = 0; j < p; j++) pred += beta[j + 1] * xs[j][i];
      const resid = y[i] - pred;
      const w = resid >= 0 ? tau : 1 - tau;
      weights.push(w / (Math.abs(resid) + 1e-6));
    }

    // Weighted least squares
    const cols = p + 1;
    const XtWX: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
    const XtWy: number[] = new Array(cols).fill(0);

    for (let i = 0; i < n; i++) {
      const row = [1, ...xs.map((x) => x[i])];
      for (let j = 0; j < cols; j++) {
        for (let k = 0; k < cols; k++) {
          XtWX[j][k] += weights[i] * row[j] * row[k];
        }
        XtWy[j] += weights[i] * row[j] * y[i];
      }
    }

    const newBeta = solveLinearSystem(XtWX, XtWy);
    if (!newBeta) break;
    beta = newBeta;
  }

  return beta;
}

export function quantileRegressionPredict(
  xs: number[][],
  y: number[],
  taus: number[],
): { tau: number; coefficients: number[] }[] {
  return taus.map((tau) => ({
    tau,
    coefficients: quantileRegression(xs, y, tau),
  }));
}

// ── Z-score Anomaly Detection ──

export interface AnomalyPoint {
  index: number;
  value: number;
  zScore: number;
  date?: string;
}

export function detectAnomalies(values: number[], threshold = 2.0, dates?: string[]): AnomalyPoint[] {
  if (values.length < 3) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const std = Math.sqrt(variance / values.length);
  if (std === 0) return [];

  const anomalies: AnomalyPoint[] = [];
  for (let i = 0; i < values.length; i++) {
    const z = (values[i] - mean) / std;
    if (Math.abs(z) >= threshold) {
      anomalies.push({ index: i, value: values[i], zScore: z, date: dates?.[i] });
    }
  }
  return anomalies;
}

// ── Residual Analysis ──

export function residualAnalysis(
  xs: number[][],
  y: number[],
  coefficients: number[],
): { predicted: number[]; residuals: number[]; mape: number } {
  const predicted: number[] = [];
  const residuals: number[] = [];
  let sumAbsPctErr = 0;
  let validCount = 0;

  for (let i = 0; i < y.length; i++) {
    let pred = coefficients[0];
    for (let j = 0; j < xs.length; j++) {
      pred += coefficients[j + 1] * xs[j][i];
    }
    predicted.push(pred);
    residuals.push(y[i] - pred);
    if (y[i] !== 0) {
      sumAbsPctErr += Math.abs((y[i] - pred) / y[i]);
      validCount++;
    }
  }

  const mape = validCount > 0 ? (sumAbsPctErr / validCount) * 100 : 0;
  return { predicted, residuals, mape };
}

// ── Efficiency Frontier (upper envelope on scatter) ──

export function efficiencyFrontier(reads: number[], incomes: number[]): { x: number; y: number }[] {
  if (reads.length === 0) return [];

  // Sort by reads, build upper envelope
  const points = reads
    .map((r, i) => ({ x: r, y: incomes[i] }))
    .filter((p) => p.x > 0)
    .sort((a, b) => a.x - b.x);

  if (points.length === 0) return [];

  const frontier: { x: number; y: number }[] = [points[0]];
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    if (points[i].y >= maxY) {
      maxY = points[i].y;
      frontier.push(points[i]);
    }
  }

  return frontier;
}

// ── Standardized Percentile Rank ──

export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const rank = sorted.filter((s) => s <= v).length;
    return (rank / n) * 100;
  });
}

/**
 * Solve Ax = b using Gaussian elimination with partial pivoting.
 * Returns null if the system is singular.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Create augmented matrix
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) return null;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      x[row] -= aug[row][col] * x[col];
    }
    x[row] /= aug[row][row];
  }

  return x;
}
