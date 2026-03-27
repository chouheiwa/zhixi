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
