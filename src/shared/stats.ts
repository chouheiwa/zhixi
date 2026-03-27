/**
 * Pearson correlation coefficient between two arrays.
 * Returns a value between -1 and 1.
 * Returns 0 if either array has zero variance.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Non-negative multiple linear regression (NNLS).
 * Fits: y = b0 + b1*x1 + b2*x2 + ... + bn*xn
 * where b1..bn >= 0 (intercept b0 is unconstrained).
 *
 * Uses iterative elimination: OLS → remove features with negative coefficients → re-fit.
 *
 * @param xs - Array of feature arrays, each feature is a number[]
 * @param y - Target array
 * @returns coefficients [b0, b1, b2, ...bn] and r2 score
 */
export function multipleLinearRegression(
  xs: number[][],
  y: number[]
): { coefficients: number[]; r2: number } {
  const n = y.length;
  const p = xs.length;

  if (n < 2) {
    return { coefficients: new Array(p + 1).fill(0), r2: 0 };
  }

  // Track which features are active (not eliminated)
  let activeIndices = xs.map((_, i) => i);
  let finalCoeffs = new Array(p + 1).fill(0);

  for (let iter = 0; iter < p + 1; iter++) {
    if (activeIndices.length === 0) break;

    const activeXs = activeIndices.map(i => xs[i]);
    const result = olsFit(activeXs, y);
    if (!result) break;

    // Check for negative feature coefficients (skip intercept at index 0)
    const negatives = [];
    for (let i = 0; i < activeIndices.length; i++) {
      if (result[i + 1] < 0) negatives.push(i);
    }

    if (negatives.length === 0) {
      // All non-negative — we're done
      finalCoeffs[0] = result[0]; // intercept
      for (let i = 0; i < activeIndices.length; i++) {
        finalCoeffs[activeIndices[i] + 1] = result[i + 1];
      }
      break;
    }

    // Remove features with negative coefficients
    const toRemove = new Set(negatives.map(i => activeIndices[i]));
    activeIndices = activeIndices.filter(i => !toRemove.has(i));

    // If this was the last iteration or no active features left, use what we have
    if (activeIndices.length === 0) {
      // Just intercept
      let yMean = 0;
      for (let i = 0; i < n; i++) yMean += y[i];
      finalCoeffs[0] = yMean / n;
    }
  }

  // If we still have active features, do a final fit
  if (activeIndices.length > 0 && finalCoeffs.every(c => c === 0)) {
    const activeXs = activeIndices.map(i => xs[i]);
    const result = olsFit(activeXs, y);
    if (result) {
      finalCoeffs[0] = result[0];
      for (let i = 0; i < activeIndices.length; i++) {
        finalCoeffs[activeIndices[i] + 1] = Math.max(0, result[i + 1]);
      }
    }
  }

  // Calculate R²
  let yMean = 0;
  for (let i = 0; i < n; i++) yMean += y[i];
  yMean /= n;

  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    let predicted = finalCoeffs[0];
    for (let j = 0; j < p; j++) {
      predicted += finalCoeffs[j + 1] * xs[j][i];
    }
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { coefficients: finalCoeffs, r2 };
}

/** OLS fit with intercept. Returns [b0, b1, ...] or null if singular. */
function olsFit(xs: number[][], y: number[]): number[] | null {
  const n = y.length;
  const p = xs.length;
  const cols = p + 1;

  const XtX: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const Xty: number[] = new Array(cols).fill(0);

  for (let i = 0; i < n; i++) {
    const row = [1, ...xs.map(x => x[i])];
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
 * Log-log elasticity regression.
 * Fits: ln(y) = a + b*ln(x) for each feature independently.
 * b = "x increases 1% → y increases b%"
 * Skips zero values (log undefined).
 */
export function elasticityAnalysis(
  xs: number[][],
  y: number[]
): { elasticities: number[]; r2s: number[] } {
  const elasticities: number[] = [];
  const r2s: number[] = [];

  for (const x of xs) {
    // Filter out pairs where either x or y is <= 0
    const validIndices: number[] = [];
    for (let i = 0; i < x.length; i++) {
      if (x[i] > 0 && y[i] > 0) validIndices.push(i);
    }

    if (validIndices.length < 3) {
      elasticities.push(0);
      r2s.push(0);
      continue;
    }

    const logX = validIndices.map(i => Math.log(x[i]));
    const logY = validIndices.map(i => Math.log(y[i]));

    // Simple OLS on log-log
    const result = olsFit([logX], logY);
    if (!result) {
      elasticities.push(0);
      r2s.push(0);
      continue;
    }

    elasticities.push(result[1]);

    // R² for log-log fit
    let mean = 0;
    for (const v of logY) mean += v;
    mean /= logY.length;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < logY.length; i++) {
      const predicted = result[0] + result[1] * logX[i];
      ssRes += (logY[i] - predicted) ** 2;
      ssTot += (logY[i] - mean) ** 2;
    }
    r2s.push(ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot));
  }

  return { elasticities, r2s };
}

/**
 * Contribution percentage from NNLS coefficients.
 * Multiplies each coefficient by the mean of its feature, then normalizes to 100%.
 */
export function contributionPercentages(
  coefficients: number[],
  xs: number[][]
): number[] {
  // coefficients[0] is intercept, coefficients[1..] are feature weights
  const contributions = xs.map((x, i) => {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    return Math.max(0, coefficients[i + 1] * mean);
  });

  const total = contributions.reduce((a, b) => a + b, 0);
  if (total === 0) return contributions.map(() => 0);
  return contributions.map(c => (c / total) * 100);
}

/**
 * Time-lagged correlation.
 * Shifts metric forward by `lag` days and computes Pearson correlation with income.
 * e.g. lag=1: does today's metric correlate with tomorrow's income?
 */
export function laggedCorrelation(
  metric: number[],
  income: number[],
  maxLag: number = 3
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
