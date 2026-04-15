# stats.ts 审计修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `src/shared/stats.ts` 的六个统计问题（NNLS 命名/算法、ridge 未标准化、contributionPercentages 吞截距、elasticity 选择偏差、缺少稳健性可视化、CLAUDE.md 文档缺口），并在 UI 上把采样稳定性和共线性透明化。

**Architecture:** 先把纯库函数改掉（P0-B 加真 NNLS → P1-B 修 ridge 标准化 → P2 改 contributionPercentages 返回类型 → P1-A 给 elasticity 加警告字段），每一步配单元测试；然后加两个新函数（P0-A：bootstrapCoefficientCI + featureCorrelationMatrix）；最后改 UI（CorrelationAnalysis.tsx 是 MLR/contribution 的消费者，IncomeAttributionChart.tsx 是 elasticity 的消费者）和 CLAUDE.md。

**Tech Stack:** TypeScript, React 18, Vitest, ECharts, Ant Design

**源设计文档：** `docs/superpowers/specs/2026-04-15-stats-audit-fixes-design.md`

**NNLS 参考实现：** `tmp/nnls-reference.cjs`（80 行可直接移植）

---

## File Structure

### 修改 / 新增文件清单

| 文件 | 动作 | 责任 |
|---|---|---|
| `src/shared/stats.ts` | 修改 | 加 `lawsonHansonNNLS` / `bootstrapCoefficientCI` / `featureCorrelationMatrix` / `ContributionBreakdown` 接口；改 `ridgeRegression` 内部做标准化；扩展 `elasticityAnalysis` 返回类型；改 `contributionPercentages` 返回类型；把 `multipleLinearRegression` 改成 Lawson-Hanson 的兼容层 |
| `src/dashboard/components/CorrelationAnalysis.tsx` | 修改 | 更新 `contributionPercentages` 调用点（返回类型变了）；加 bootstrap CI 稳健性条；加相关性矩阵热力图；消费 elasticity 的新警告字段 |
| `src/dashboard/components/IncomeAttributionChart.tsx` | 修改 | 消费 `ElasticityResult.conditionalWarnings` / `nUsed`，在指标列表旁显示"仅非零条件弹性"警告图标 |
| `src/shared/ml-realtime.ts` | 核查 | 调用 `ridgeRegression(xs, trainY, 1.0)` — 标准化后行为会变，需要重跑测试确认 ML 链路无回归 |
| `src/shared/ml-models.ts` | 核查 | 调用 `ridgeRegression(xs, trainY, 0.1)` — 同上 |
| `src/dashboard/components/ResidualChart.tsx` | 核查 | 调用 `ridgeRegression(xs, incomes, 0.5)` — 同上 |
| `tests/shared/stats.test.ts` | 修改 | 更新 `contributionPercentages` 测试以匹配新返回类型 |
| `tests/shared/stats-extended.test.ts` | 修改 | 更新 `ridgeRegression` 测试：lambda=0 等价 OLS、lambda 大收缩显著 |
| `tests/shared/stats-nnls.test.ts` | 新增 | `lawsonHansonNNLS` 的 3 组测试 + `bootstrapCoefficientCI` 的稳定/共线测试 + `featureCorrelationMatrix` 测试 |
| `CLAUDE.md` | 修改 | `NNLS multicollinearity caveat` 段后追加两段：采样敏感 + 文章撰写约束 |

---

## Task 1: Lawson-Hanson NNLS 核心实现（P0-B 的一部分）

**Files:**
- Modify: `src/shared/stats.ts`（在 `multipleLinearRegression` 函数前新增）
- Create: `tests/shared/stats-nnls.test.ts`

- [ ] **Step 1.1: 写 `lawsonHansonNNLS` 的三组失败测试**

创建 `tests/shared/stats-nnls.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { lawsonHansonNNLS } from '@/shared/stats';

describe('lawsonHansonNNLS', () => {
  // Test 1: 已知闭式解 y = 2·x1 + 3·x2
  it('finds the exact solution for a clean linear problem', () => {
    // 特征按列：xs[0] = x1, xs[1] = x2
    const xs = [
      [1, 0, 1, 2], // x1
      [0, 1, 1, 1], // x2
    ];
    const y = [2, 3, 5, 7];
    const result = lawsonHansonNNLS(xs, y);
    // 预期截距 0, x1≈2, x2≈3
    expect(result.coefficients[0]).toBeCloseTo(0, 3);
    expect(result.coefficients[1]).toBeCloseTo(2, 3);
    expect(result.coefficients[2]).toBeCloseTo(3, 3);
    expect(result.r2).toBeCloseTo(1, 5);
  });

  // Test 2: OLS 本来会给负系数 → NNLS 必须约束
  it('clips features whose OLS coefficient would be negative', () => {
    const xs = [
      [1, 0, 1, 2], // x1
      [0, 1, 1, 1], // x2
    ];
    // 构造 y 使得无约束 OLS 会给 x2 负系数：y ≈ x1 - x2
    const y = [1, -1, 0, 1];
    const result = lawsonHansonNNLS(xs, y);
    // x2 应该被约束为 0；x1 >= 0
    expect(result.coefficients[2]).toBeCloseTo(0, 5);
    expect(result.coefficients[1]).toBeGreaterThanOrEqual(-1e-9);
  });

  // Test 3: 多重共线性 x1 ≈ x2, y = 2·x1 + noise
  it('stays stable under multicollinearity', () => {
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const x2 = x1.map((v) => v + 1e-6); // 几乎完全共线
    const y = x1.map((v) => 2 * v);
    const result = lawsonHansonNNLS([x1, x2], y);
    // 至少有一个系数被清零或接近 0；两系数之和≈2
    const sum = result.coefficients[1] + result.coefficients[2];
    expect(sum).toBeGreaterThan(1.5);
    expect(sum).toBeLessThan(2.5);
    expect(result.r2).toBeGreaterThan(0.99);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全部 fail**

Run: `yarn test tests/shared/stats-nnls.test.ts`
Expected: 3 tests FAIL with `lawsonHansonNNLS is not a function`

- [ ] **Step 1.3: 在 `src/shared/stats.ts` 加入 `lawsonHansonNNLS` 实现**

在 `olsFit` 函数之后（大约 line 142）插入：

```typescript
/**
 * Lawson-Hanson non-negative least squares.
 * Solves: min ||Ax - b||² s.t. x >= 0
 *
 * Guaranteed to find the global optimum of the constrained problem.
 * Unlike the iterative elimination heuristic in the original
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
 * @returns coefficients [b0, b1, ...] with b1..bn >= 0, plus r2 and iteration count
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
    if (M.length === 0) return [];
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
    return sol ?? new Array(k).fill(0);
  };

  let iterations = 0;
  while (iterations < maxIter) {
    iterations++;
    const Ax = matVec(A, x);
    const resid = new Array(n);
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
    if (jMax === -1) break; // KKT satisfied

    R.delete(jMax);
    P.add(jMax);

    // Inner loop: resolve infeasibility introduced by adding jMax to P.
    while (iterations < maxIter) {
      iterations++;
      const active = [...P].sort((a, b) => a - b);
      const s = solveActiveOLS(active);

      // Intercept (index 0) is unconstrained; only feature columns must be > 0.
      let anyInfeasible = false;
      for (let i = 0; i < active.length; i++) {
        if (active[i] !== 0 && s[i] <= tol) {
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
        if (s[i] <= tol) {
          const denom = x[col] - s[i];
          if (denom > tol) {
            const a = x[col] / denom;
            if (a < alpha) alpha = a;
          }
        }
      }

      for (let i = 0; i < active.length; i++) {
        const col = active[i];
        x[col] = x[col] + alpha * (s[i] - x[col]);
      }

      // Move all x_j ≤ tol (among feature columns) from P back to R.
      const toRemove: number[] = [];
      for (const j of P) {
        if (j !== 0 && x[j] <= tol) toRemove.push(j);
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

  return { coefficients: [...x], r2, iterations };
}
```

- [ ] **Step 1.4: 跑测试确认 3 个 NNLS 测试通过**

Run: `yarn test tests/shared/stats-nnls.test.ts`
Expected: 3 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats-nnls.test.ts
git commit -m "feat(stats): add Lawson-Hanson NNLS with active-set method"
```

---

## Task 2: `multipleLinearRegression` 改成 Lawson-Hanson 兼容层（P0-B 的第二部分）

**Files:**
- Modify: `src/shared/stats.ts:30-119`

- [ ] **Step 2.1: 写兼容性测试确认现有调用不破坏**

追加到 `tests/shared/stats-nnls.test.ts`：

```typescript
import { multipleLinearRegression } from '@/shared/stats';

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
    expect(result.coefficients[1]).toBeGreaterThanOrEqual(-1e-9);
    expect(result.coefficients[2]).toBeGreaterThanOrEqual(-1e-9);
  });
});
```

- [ ] **Step 2.2: 跑测试确认原有 `tests/shared/stats.test.ts` 的 4 个 MLR 测试依然通过（作为 baseline）**

Run: `yarn test tests/shared/stats.test.ts -t "multipleLinearRegression"`
Expected: 4 PASS

- [ ] **Step 2.3: 把 `multipleLinearRegression` 函数体替换为 Lawson-Hanson 委托**

替换 `src/shared/stats.ts` line 30-119 的整个函数为：

```typescript
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
export function multipleLinearRegression(
  xs: number[][],
  y: number[],
): { coefficients: number[]; r2: number } {
  const result = lawsonHansonNNLS(xs, y);
  return { coefficients: result.coefficients, r2: result.r2 };
}
```

**注意**：`lawsonHansonNNLS` 必须在 `multipleLinearRegression` 之前（或同一文件任意位置）声明。JavaScript function hoisting 对 `function` 声明有效，所以顺序可以任意，但为了可读性把 `lawsonHansonNNLS` 放在 `olsFit` 后紧接 `multipleLinearRegression` 前。

- [ ] **Step 2.4: 跑全部 stats 测试**

Run: `yarn test tests/shared/`
Expected: 所有现有测试 PASS（包括 stats.test.ts、stats-extended.test.ts、stats-nnls.test.ts）

- [ ] **Step 2.5: 跑 type-check 和 lint**

Run: `yarn type-check && yarn lint`
Expected: 无错误

- [ ] **Step 2.6: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats-nnls.test.ts
git commit -m "refactor(stats): multipleLinearRegression now delegates to lawsonHansonNNLS"
```

---

## Task 3: `ridgeRegression` 特征标准化修复（P1-B）

**Files:**
- Modify: `src/shared/stats.ts:427-471`
- Modify: `tests/shared/stats-extended.test.ts:181-200`

- [ ] **Step 3.1: 写失败测试：λ=0 等价 OLS + 大 λ 明显收缩 + 反变换正确**

替换 `tests/shared/stats-extended.test.ts:181-200` 的 `describe('ridgeRegression', ...)` 为：

```typescript
describe('ridgeRegression', () => {
  it('with lambda=0 returns the OLS solution', () => {
    // y = 2x + 1, λ=0 应该完全复原
    const result = ridgeRegression([[1, 2, 3, 4]], [3, 5, 7, 9], 0);
    expect(result.coefficients[0]).toBeCloseTo(1, 3);
    expect(result.coefficients[1]).toBeCloseTo(2, 3);
    expect(result.r2).toBeCloseTo(1, 5);
  });

  it('with large lambda visibly shrinks feature coefficients', () => {
    const xs = [[1, 2, 3, 4, 5, 6, 7, 8]];
    const y = [2, 4, 6, 8, 10, 12, 14, 16];
    const ols = ridgeRegression(xs, y, 0);
    const shrunk = ridgeRegression(xs, y, 100);
    expect(Math.abs(shrunk.coefficients[1])).toBeLessThan(Math.abs(ols.coefficients[1]) * 0.9);
  });

  it('handles features with wildly different scales (standardization test)', () => {
    // 两个特征尺度差 1000 倍。没有标准化的 ridge 会只惩罚小尺度特征，
    // 标准化后 λ 的语义对两个特征对称。
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8];             // small scale
    const x2 = x1.map((v) => v * 1000);              // large scale
    const y = x1.map((v, i) => 2 * v + 0.003 * x2[i]); // y = 2*x1 + 3*x1 = 5*x1 equivalent
    const result = ridgeRegression([x1, x2], y, 1.0);
    // 预测值应该还原原始 y（反变换正确）
    for (let i = 0; i < y.length; i++) {
      const pred = result.coefficients[0] + result.coefficients[1] * x1[i] + result.coefficients[2] * x2[i];
      expect(pred).toBeCloseTo(y[i], 0); // within ±0.5
    }
  });

  it('returns zero coefficients for insufficient data', () => {
    expect(ridgeRegression([[1]], [2])).toEqual({ coefficients: [0, 0], r2: 0 });
  });

  it('handles zero-variance features without NaN', () => {
    // x2 全常量 → std = 0，标准化需要防 NaN
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [7, 7, 7, 7, 7];
    const y = [2, 4, 6, 8, 10];
    const result = ridgeRegression([x1, x2], y, 1.0);
    expect(Number.isFinite(result.coefficients[0])).toBe(true);
    expect(Number.isFinite(result.coefficients[1])).toBe(true);
    expect(Number.isFinite(result.coefficients[2])).toBe(true);
  });
});
```

- [ ] **Step 3.2: 跑测试确认新 case 失败（标准化和反变换还没做）**

Run: `yarn test tests/shared/stats-extended.test.ts -t "ridgeRegression"`
Expected: "handles features with wildly different scales" 和 "with lambda=0 returns the OLS solution" 可能 FAIL

- [ ] **Step 3.3: 替换 `ridgeRegression` 实现为标准化版本**

替换 `src/shared/stats.ts:427-471` 的整个函数：

```typescript
// ── Ridge Regression: minimize ||y - Xβ||² + λ||β||² ──
//
// Features are z-score standardized internally so the penalty λ applies
// uniformly across feature scales; coefficients are then un-standardized
// before being returned. λ is interpreted on the standardized scale:
//   λ = 0   → equivalent to OLS
//   λ = 1   → mild regularization (1 unit of L2 per standardized feature)
//   λ = 100 → strong shrinkage

export function ridgeRegression(
  xs: number[][],
  y: number[],
  lambda = 1.0,
): { coefficients: number[]; r2: number } {
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
```

- [ ] **Step 3.4: 跑 ridge 测试确认全部通过**

Run: `yarn test tests/shared/stats-extended.test.ts -t "ridgeRegression"`
Expected: 5 PASS

- [ ] **Step 3.5: 跑全量 stats 测试确认上游调用（interactionRegression / ml-realtime / ml-models / ResidualChart 的内部测试）没坏**

Run: `yarn test tests/shared/`
Expected: 全部 PASS

- [ ] **Step 3.6: 跑 type-check + lint**

Run: `yarn type-check && yarn lint`
Expected: 无错误

- [ ] **Step 3.7: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats-extended.test.ts
git commit -m "fix(stats): ridgeRegression standardizes features so lambda actually penalizes"
```

---

## Task 4: `contributionPercentages` 返回类型 breaking change（P2）

**Files:**
- Modify: `src/shared/stats.ts:221-235`
- Modify: `tests/shared/stats.test.ts:101-117`
- Modify: `src/dashboard/components/CorrelationAnalysis.tsx:140-146, 176, 384-399`

- [ ] **Step 4.1: 重写 `contributionPercentages` 测试 expecting 新返回类型**

替换 `tests/shared/stats.test.ts:101-117` 的 `describe('contributionPercentages', ...)` 为：

```typescript
describe('contributionPercentages', () => {
  it('returns feature + baseline percentages summing to 100', () => {
    const result = contributionPercentages(
      [0, 0.5, 0.3],
      [[10, 20, 30], [5, 10, 15]],
    );
    const total =
      result.featurePercentages.reduce((a, b) => a + b, 0) + result.baselinePercentage;
    expect(total).toBeCloseTo(100, 3);
  });

  it('exposes absolute contributions and flags negative coefficients', () => {
    const result = contributionPercentages(
      [10, -0.1, 0.5],
      [[100, 100, 100], [50, 50, 50]],
    );
    expect(result.hasNegativeCoefficients).toBe(true);
    expect(result.absoluteContributions.baseline).toBeCloseTo(10, 6);
    expect(result.absoluteContributions.features[0]).toBeCloseTo(-10, 6);
    expect(result.absoluteContributions.features[1]).toBeCloseTo(25, 6);
  });

  it('reports baseline percentage when intercept dominates', () => {
    // intercept=100, each feature contributes 0 → baseline 100%
    const result = contributionPercentages([100, 0, 0], [[1, 2], [3, 4]]);
    expect(result.baselinePercentage).toBeCloseTo(100, 3);
    expect(result.featurePercentages).toEqual([0, 0]);
  });

  it('handles zero total predicted income safely', () => {
    const result = contributionPercentages([0, 0, 0], [[1, 2], [3, 4]]);
    expect(result.featurePercentages).toEqual([0, 0]);
    expect(result.baselinePercentage).toBe(0);
    expect(result.hasNegativeCoefficients).toBe(false);
  });
});
```

- [ ] **Step 4.2: 跑测试确认 fail（类型不符）**

Run: `yarn test tests/shared/stats.test.ts -t "contributionPercentages"`
Expected: 4 FAIL（旧实现返回 `number[]`，新测试期待 object）

- [ ] **Step 4.3: 新增 `ContributionBreakdown` 接口 + 改写 `contributionPercentages`**

替换 `src/shared/stats.ts:221-235` 为：

```typescript
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
 * ⚠️ The returned `featurePercentages + baselinePercentage` sums to 100 only
 * when no feature contribution is negative. When `hasNegativeCoefficients` is
 * true, callers should surface a warning (the absolute decomposition is still
 * valid).
 */
export function contributionPercentages(
  coefficients: number[],
  xs: number[][],
): ContributionBreakdown {
  const p = xs.length;
  const intercept = coefficients[0] ?? 0;
  const means = xs.map((x) => (x.length > 0 ? x.reduce((a, b) => a + b, 0) / x.length : 0));
  const featureContribs = means.map((m, i) => (coefficients[i + 1] ?? 0) * m);
  const hasNeg = featureContribs.some((c) => c < 0);

  const totalPredicted = intercept + featureContribs.reduce((a, b) => a + b, 0);

  if (totalPredicted === 0) {
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
```

- [ ] **Step 4.4: 跑 contributionPercentages 测试确认通过**

Run: `yarn test tests/shared/stats.test.ts -t "contributionPercentages"`
Expected: 4 PASS

- [ ] **Step 4.5: 跑 type-check 看编译错误**

Run: `yarn type-check`
Expected: `src/dashboard/components/CorrelationAnalysis.tsx` 报错（`contribPcts[i]` 不再是 number）

- [ ] **Step 4.6: 更新 `CorrelationAnalysis.tsx` 的调用点以匹配新返回类型**

修改 `src/dashboard/components/CorrelationAnalysis.tsx:140-146`（`contribPcts` 相关逻辑）：

```typescript
// Before:
// const contribPcts = contributionPercentages(regression.coefficients, xs);
// const contributions = METRIC_INFO.map(({ key, label, color }, i) => ({
//   key,
//   label,
//   color,
//   pct: contribPcts[i],
// })).sort((a, b) => b.pct - a.pct);

// After:
const contribBreakdown = contributionPercentages(regression.coefficients, xs);
const contributions = METRIC_INFO.map(({ key, label, color }, i) => ({
  key,
  label,
  color,
  pct: contribBreakdown.featurePercentages[i],
})).sort((a, b) => b.pct - a.pct);
const baselinePct = contribBreakdown.baselinePercentage;
const baselineAbs = contribBreakdown.absoluteContributions.baseline;
const contribHasNegative = contribBreakdown.hasNegativeCoefficients;
```

修改同文件 `analysis` 的 return 块（大约 line 178-193），补进：

```typescript
return {
  correlations,
  regression,
  weights,
  contributions,
  baselinePct,
  baselineAbs,
  contribHasNegative,
  elasticities,
  ridge,
  ridgeWeights,
  interaction,
  topInteractions,
  quantiles,
  residuals,
  contentCount: aggregated.length,
  topContrib,
};
```

在"收益主要靠什么？" `Card` 的底部（大约 `analysis.contributions.map` 循环之后）追加 baseline 行：

```tsx
{/* Baseline (intercept) row, always visible even when small */}
<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
  <div style={{ width: 50, fontSize: 12, color: '#999' }}>基础</div>
  <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
    <div
      style={{
        width: `${Math.min(Math.abs(analysis.baselinePct), 100)}%`,
        height: '100%',
        background: '#bbb',
        borderRadius: 8,
      }}
    />
  </div>
  <div style={{ width: 45, fontSize: 12, textAlign: 'right', color: '#666' }}>
    {analysis.baselinePct.toFixed(1)}%
  </div>
</div>
{analysis.contribHasNegative && (
  <div style={{ marginTop: 8, fontSize: 11, color: themeColors.amber }}>
    ⚠️ 检测到负系数（通常来自 ridge 回归），贡献度含义被部分抵消；请结合绝对分解阅读。
  </div>
)}
```

- [ ] **Step 4.7: 跑 type-check + lint + 全量 test**

Run: `yarn type-check && yarn lint && yarn test`
Expected: 全部通过

- [ ] **Step 4.8: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats.test.ts src/dashboard/components/CorrelationAnalysis.tsx
git commit -m "refactor(stats): contributionPercentages returns explicit baseline breakdown"
```

---

## Task 5: `elasticityAnalysis` 零值率警告字段（P1-A）

**Files:**
- Modify: `src/shared/stats.ts:168-219`
- Modify: `tests/shared/stats.test.ts:73-99`
- Modify: `src/dashboard/components/IncomeAttributionChart.tsx`

- [ ] **Step 5.1: 写失败测试：低零值率无警告 / 高零值率有警告**

追加到 `tests/shared/stats.test.ts` 的 `describe('elasticityAnalysis', ...)` 块内：

```typescript
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
  // 10 samples, only 3 valid (x>0 AND y>0) → samplingFraction = 0.3
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
```

- [ ] **Step 5.2: 跑 elasticity 测试确认 3 个新 case 全部 FAIL（字段不存在）**

Run: `yarn test tests/shared/stats.test.ts -t "elasticityAnalysis"`
Expected: 3 FAIL

- [ ] **Step 5.3: 扩展 `elasticityAnalysis` 返回类型并填充新字段**

替换 `src/shared/stats.ts:168-219` 的整个 `elasticityAnalysis` 函数为：

```typescript
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
  /** Human-readable warnings when samplingFraction[i] < 0.5. */
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
    if (samplingFraction[i] < 0.5) {
      const pct = (samplingFraction[i] * 100).toFixed(0);
      conditionalWarnings.push(
        `Feature ${i}: only ${nUsed[i]}/${totalN} samples used (${pct}%). ` +
          `Elasticity ${elasticities[i].toFixed(3)} is conditional on x > 0, ` +
          `not a marginal effect. Interpret with caution.`,
      );
    }
  }

  return { elasticities, r2s, nUsed, totalN, samplingFraction, conditionalWarnings };
}
```

- [ ] **Step 5.4: 跑 elasticity 测试确认通过**

Run: `yarn test tests/shared/stats.test.ts -t "elasticityAnalysis"`
Expected: 全部 PASS（4 老 + 3 新 = 7）

- [ ] **Step 5.5: 跑 type-check（期待 IncomeAttributionChart.tsx 无错，因为只读 `elasticities` / `r2s`）**

Run: `yarn type-check`
Expected: 0 错误（新字段向后兼容）

- [ ] **Step 5.6: 在 `IncomeAttributionChart.tsx` 显示条件弹性警告图标**

修改 `src/dashboard/components/IncomeAttributionChart.tsx:59`，把 `elasticityAnalysis` 解构扩展：

```typescript
const { elasticities, r2s, samplingFraction, conditionalWarnings } = elasticityAnalysis(xs, y);
```

在 useMemo 的返回对象里加入 `samplingFraction` 和 `conditionalWarnings`（line 76-83），并在 `sortedMetrics` 构造处（line 110-118）加入 `samplingFraction`：

```typescript
const sortedMetrics = result.metrics
  .map((m, i) => ({
    label: m.label,
    color: m.color,
    contribution: result.contributions[i],
    elasticity: result.elasticities[i],
    r2: result.r2s[i],
    samplingFraction: result.samplingFraction[i],
  }))
  .sort((a, b) => b.contribution - a.contribution);
```

在指标列表渲染处（line 178-194）每一行末尾追加条件弹性提示：

```tsx
{m.samplingFraction < 0.5 && (
  <span style={{ marginLeft: 4, color: themeColors.amber }}>
    （仅 {(m.samplingFraction * 100).toFixed(0)}% 样本参与拟合，为非零条件弹性）
  </span>
)}
```

如果 `result.conditionalWarnings.length > 0`，在 `<FormulaBlock />` 之前插入一条 Alert：

```tsx
{result.conditionalWarnings.length > 0 && (
  <Alert
    type="warning"
    showIcon
    style={{ marginTop: 8, fontSize: 12 }}
    message="部分指标的弹性为非零条件估计"
    description="零值率高的指标（如分享、评论）在对数回归里只用到少量样本，结果是 "x > 0 时的条件弹性"，不代表边际效应。"
  />
)}
```

- [ ] **Step 5.7: 跑 type-check + lint + 全量 test**

Run: `yarn type-check && yarn lint && yarn test`
Expected: 全部通过

- [ ] **Step 5.8: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats.test.ts src/dashboard/components/IncomeAttributionChart.tsx
git commit -m "feat(stats): elasticityAnalysis exposes sampling fraction and conditional warnings"
```

---

## Task 6: `bootstrapCoefficientCI` 新函数（P0-A 的一部分）

**Files:**
- Modify: `src/shared/stats.ts`（在 `lawsonHansonNNLS` 之后新增）
- Modify: `tests/shared/stats-nnls.test.ts`

- [ ] **Step 6.1: 写失败测试：稳定数据的 CI 应窄，共线数据的 CI 应宽**

追加到 `tests/shared/stats-nnls.test.ts`：

```typescript
import { bootstrapCoefficientCI, multipleLinearRegression } from '@/shared/stats';

describe('bootstrapCoefficientCI', () => {
  it('produces narrow CIs on clean linear data', () => {
    // y = 2·x1 + 3·x2
    const x1 = Array.from({ length: 60 }, (_, i) => (i % 10) + 1);
    const x2 = Array.from({ length: 60 }, (_, i) => ((i * 7) % 10) + 1);
    const y = x1.map((v, i) => 2 * v + 3 * x2[i]);
    const ci = bootstrapCoefficientCI(
      [x1, x2],
      y,
      (xs, y2) => multipleLinearRegression(xs, y2),
      50,
    );
    // Coefficient medians should be close to 2 and 3 (indexes 1,2 because 0 is intercept)
    expect(ci.median[1]).toBeCloseTo(2, 1);
    expect(ci.median[2]).toBeCloseTo(3, 1);
    // Width should be small (each side < 0.5)
    expect(ci.hi[1] - ci.lo[1]).toBeLessThan(0.5);
    expect(ci.hi[2] - ci.lo[2]).toBeLessThan(0.5);
    expect(ci.stability[1]).toBe('stable');
    expect(ci.stability[2]).toBe('stable');
  });

  it('tags features that are always zero as "dropped"', () => {
    // x3 is pure noise that NNLS will always eliminate
    const x1 = Array.from({ length: 40 }, (_, i) => i + 1);
    const x2 = Array.from({ length: 40 }, (_, i) => ((i * 3) % 8) + 1);
    const x3 = x1.map(() => 0); // always zero → always eliminated
    const y = x1.map((v, i) => 2 * v + x2[i]);
    const ci = bootstrapCoefficientCI(
      [x1, x2, x3],
      y,
      (xs, y2) => multipleLinearRegression(xs, y2),
      50,
    );
    expect(ci.stability[3]).toBe('dropped');
  });

  it('tags unstable features (wide CI relative to median) as "unstable"', () => {
    // Two nearly collinear features on y = x1 + x2; NNLS will oscillate which
    // one gets the weight across bootstrap samples.
    const x1 = Array.from({ length: 50 }, (_, i) => i + 1);
    const x2 = x1.map((v) => v + Math.random() * 0.001);
    const y = x1.map((v, i) => v + x2[i]);
    const ci = bootstrapCoefficientCI(
      [x1, x2],
      y,
      (xs, y2) => multipleLinearRegression(xs, y2),
      100,
    );
    // At least one of the two should be "unstable" OR "dropped"
    const labels = [ci.stability[1], ci.stability[2]];
    expect(labels.some((s) => s === 'unstable' || s === 'dropped')).toBe(true);
  });
});
```

- [ ] **Step 6.2: 跑测试确认 fail（函数不存在）**

Run: `yarn test tests/shared/stats-nnls.test.ts -t "bootstrapCoefficientCI"`
Expected: 3 FAIL

- [ ] **Step 6.3: 在 `src/shared/stats.ts` 加 `bootstrapCoefficientCI`**

在 `lawsonHansonNNLS` 函数之后追加：

```typescript
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
 * @param xs - Feature arrays
 * @param y  - Target array
 * @param regressionFn - Regression function returning { coefficients, r2 }
 * @param B  - Number of bootstrap iterations (default 200)
 * @param ciLevel - Confidence level in (0, 1), default 0.95
 */
export type StabilityLabel = 'stable' | 'unstable' | 'dropped';

export function bootstrapCoefficientCI(
  xs: number[][],
  y: number[],
  regressionFn: (xs: number[][], y: number[]) => { coefficients: number[]; r2: number },
  B: number = 200,
  ciLevel: number = 0.95,
): { lo: number[]; median: number[]; hi: number[]; stability: StabilityLabel[] } {
  const n = y.length;
  const p = xs.length;
  const m = p + 1;
  if (n < 2 || p === 0) {
    return { lo: new Array(m).fill(0), median: new Array(m).fill(0), hi: new Array(m).fill(0), stability: new Array(m).fill('dropped') };
  }

  // Distribution of each coefficient across B resamples
  const samples: number[][] = Array.from({ length: m }, () => []);

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

    // Stability classification
    if (j === 0) {
      // intercept: use width relative to median if meaningful
      stability[j] = 'stable';
      continue;
    }
    const zeroFraction = sorted.filter((v) => Math.abs(v) < 1e-9).length / sorted.length;
    if (zeroFraction >= 0.95) {
      stability[j] = 'dropped';
    } else if (Math.abs(median[j]) > 1e-9 && (hi[j] - lo[j]) / Math.abs(median[j]) < 0.5) {
      stability[j] = 'stable';
    } else {
      stability[j] = 'unstable';
    }
  }

  return { lo, median, hi, stability };
}
```

- [ ] **Step 6.4: 跑测试确认通过**

Run: `yarn test tests/shared/stats-nnls.test.ts -t "bootstrapCoefficientCI"`
Expected: 3 PASS

- [ ] **Step 6.5: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats-nnls.test.ts
git commit -m "feat(stats): bootstrapCoefficientCI for coefficient stability analysis"
```

---

## Task 7: `featureCorrelationMatrix` 新函数（P0-A 的另一部分）

**Files:**
- Modify: `src/shared/stats.ts`
- Modify: `tests/shared/stats-nnls.test.ts`

- [ ] **Step 7.1: 写失败测试**

追加到 `tests/shared/stats-nnls.test.ts`：

```typescript
import { featureCorrelationMatrix } from '@/shared/stats';

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
```

- [ ] **Step 7.2: 跑测试确认 fail**

Run: `yarn test tests/shared/stats-nnls.test.ts -t "featureCorrelationMatrix"`
Expected: 3 FAIL

- [ ] **Step 7.3: 在 `src/shared/stats.ts` 加 `featureCorrelationMatrix`**

在 `bootstrapCoefficientCI` 之后追加：

```typescript
/**
 * Pairwise Pearson correlation matrix between features.
 * Returns a p×p symmetric matrix where entry [i][j] = corr(xs[i], xs[j]).
 * The diagonal is always 1. Useful for diagnosing multicollinearity before
 * interpreting multivariate regression coefficients.
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
```

- [ ] **Step 7.4: 跑测试确认通过**

Run: `yarn test tests/shared/stats-nnls.test.ts -t "featureCorrelationMatrix"`
Expected: 3 PASS

- [ ] **Step 7.5: 跑全量 test + type-check + lint**

Run: `yarn test && yarn type-check && yarn lint`
Expected: 全部通过

- [ ] **Step 7.6: Commit**

```bash
git add src/shared/stats.ts tests/shared/stats-nnls.test.ts
git commit -m "feat(stats): featureCorrelationMatrix for multicollinearity diagnosis"
```

---

## Task 8: CorrelationAnalysis.tsx 稳健性指示器 UI（P0-A UI 部分）

**Files:**
- Modify: `src/dashboard/components/CorrelationAnalysis.tsx`

> 原设计文档说要改 `IncomeAttributionChart.tsx`，但实际 MLR/contributionPercentages 的消费者是 `CorrelationAnalysis.tsx`（`IncomeAttributionChart.tsx` 只用 elasticity）。稳健性条应加在 MLR 实际展示的地方。

- [ ] **Step 8.1: 在 `CorrelationAnalysis.tsx` 顶部增加 import**

修改 `src/dashboard/components/CorrelationAnalysis.tsx:6-17`，追加：

```typescript
import {
  pearsonCorrelation,
  spearmanCorrelation,
  multipleLinearRegression,
  elasticityAnalysis,
  contributionPercentages,
  ridgeRegression,
  interactionRegression,
  quantileRegressionPredict,
  residualAnalysis,
  computeRPM,
  bootstrapCoefficientCI,
  featureCorrelationMatrix,
} from '@/shared/stats';
```

- [ ] **Step 8.2: 在 analysis useMemo 里计算 bootstrap CI 和相关性矩阵**

在现有 `const regression = multipleLinearRegression(xs, incomeValues);` 之后（大约 line 132）插入：

```typescript
const coefficientCI = bootstrapCoefficientCI(
  xs,
  incomeValues,
  (featureXs, y2) => multipleLinearRegression(featureXs, y2),
  100, // use 100 iterations to keep it under ~300ms for typical sample sizes
);
const corrMatrix = featureCorrelationMatrix(xs);
```

并在 analysis 对象的 return（line 178-193）里追加：

```typescript
return {
  // ...existing fields...
  coefficientCI,
  corrMatrix,
};
```

- [ ] **Step 8.3: 在 "收益主要靠什么？" Card 上方插入 "采样稳定性" Card**

在 `<Col span={12}><Card title="收益主要靠什么？" ...>` 之前（或作为独立的 `<Col span={24}>` 放在 Row 顶部），插入：

```tsx
<Col span={24}>
  <Card title="采样稳定性 (100 次 bootstrap, 95% CI)" subtitle="单点系数在重采样下的波动范围">
    {METRIC_INFO.map((metric, i) => {
      const idx = i + 1; // coefficients[0] is intercept
      const lo = analysis.coefficientCI.lo[idx];
      const hi = analysis.coefficientCI.hi[idx];
      const med = analysis.coefficientCI.median[idx];
      const label = analysis.coefficientCI.stability[idx];
      const icon = label === 'stable' ? '✅' : label === 'unstable' ? '⚠️' : '❌';
      const text = label === 'stable' ? '稳定' : label === 'unstable' ? '不稳定' : '始终剔除';
      return (
        <div key={metric.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ width: 60, color: '#666' }}>{metric.label}</div>
          <div style={{ flex: 1, fontFamily: 'monospace', color: '#333' }}>
            {med.toFixed(2)} ({lo.toFixed(2)} ~ {hi.toFixed(2)})
          </div>
          <div style={{ width: 110, textAlign: 'right' }}>
            <span style={{ marginRight: 4 }}>{icon}</span>
            {text}
          </div>
        </div>
      );
    })}
  </Card>
</Col>
```

- [ ] **Step 8.4: 在稳健性 Card 下方加一个可折叠的相关性矩阵**

在步骤 8.3 的 `<Col span={24}>` 之后（同 Row 内）插入：

```tsx
<Col span={24}>
  <Card title="特征相关性矩阵 (Pearson)" subtitle="|r| > 0.7 的配对说明信号重叠，单点系数对采样敏感">
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: 4 }}></th>
            {METRIC_INFO.map((m) => (
              <th key={m.key} style={{ padding: 4, color: '#666', fontWeight: 500 }}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_INFO.map((rowMetric, i) => (
            <tr key={rowMetric.key}>
              <td style={{ padding: 4, color: '#666' }}>{rowMetric.label}</td>
              {METRIC_INFO.map((_, j) => {
                const r = analysis.corrMatrix[i][j];
                const abs = Math.abs(r);
                const bg =
                  i === j
                    ? '#eee'
                    : abs > 0.7
                      ? 'rgba(235, 100, 100, 0.35)'
                      : abs > 0.4
                        ? 'rgba(235, 200, 80, 0.25)'
                        : '#fafafa';
                return (
                  <td
                    key={j}
                    style={{
                      padding: 4,
                      background: bg,
                      textAlign: 'center',
                      border: '1px solid #eee',
                      fontFamily: 'monospace',
                    }}
                  >
                    {r.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
</Col>
```

- [ ] **Step 8.5: 把"收益主要靠什么？" Card 标题改成"当前样本下的贡献度估计"**

修改对应 `<Card title="收益主要靠什么？" ...>` 为：

```tsx
<Card title="当前样本下的贡献度估计" subtitle="请先查看上方的采样稳定性；高度不稳定的系数不应作为决策依据">
```

- [ ] **Step 8.6: 跑 type-check + lint**

Run: `yarn type-check && yarn lint`
Expected: 无错误

- [ ] **Step 8.7: 冒烟测试 UI：跑 dev server 并在 dashboard 打开"相关性分析"面板**

Run (background): `yarn dev`
手动测试：加载 dist/ 作为扩展 → 打开 dashboard → 进入"综合分析"Tab → 确认新出现：
1. "采样稳定性" 条目（每个指标一行，带 ✅/⚠️/❌ 图标）
2. "特征相关性矩阵" 表格（对角线为 1.00，高相关格有红色背景）
3. "当前样本下的贡献度估计" 柱状图 + baseline 行

如果无法手动测试（例如没抓过数据），跳过此步并在 commit 里注明 "UI tested with existing fixture data only"。

- [ ] **Step 8.8: Commit**

```bash
git add src/dashboard/components/CorrelationAnalysis.tsx
git commit -m "feat(dashboard): show bootstrap CI and correlation matrix in attribution panel"
```

---

## Task 9: CLAUDE.md NNLS caveat 补强（P0-C）

**Files:**
- Modify: `CLAUDE.md:97-99`

- [ ] **Step 9.1: 在现有 `NNLS multicollinearity caveat` 段后追加两段**

修改 `CLAUDE.md:99`，把：

```markdown
**NNLS multicollinearity caveat**: `multipleLinearRegression` + `contributionPercentages` will zero out highly correlated features (e.g. PV vs upvotes). For attribution UIs that must show non-zero contributions for every feature, prefer `elasticityAnalysis` (independent per-feature log-log regression) — see `IncomeAttributionChart.tsx` for the pattern.
```

改为：

```markdown
**NNLS multicollinearity caveat**: `multipleLinearRegression` (now internally delegating to the Lawson-Hanson solver `lawsonHansonNNLS`) + `contributionPercentages` will zero out highly correlated features (e.g. PV vs upvotes). For attribution UIs that must show non-zero contributions for every feature, prefer `elasticityAnalysis` (independent per-feature log-log regression) — see `IncomeAttributionChart.tsx` for the pattern.

**Additionally**: On highly-correlated interaction features (any pair with `|r| > 0.7`), the non-zero coefficients from `multipleLinearRegression` are also sample-sensitive. A single-point output like "collect contributes 73.7%" has non-trivial variance under resampling. Any UI displaying regression coefficients on such data MUST also call `bootstrapCoefficientCI` and `featureCorrelationMatrix` (both in `src/shared/stats.ts`) so users see the instability — `CorrelationAnalysis.tsx` shows the expected pattern.

When writing about regression results in user-facing content (articles, blog posts, documentation), do NOT claim "X is eliminated" or "X contributes 0%" as definitive statements. Instead, frame it as "under the current sample, X's coefficient is 0 in N out of K cross-validation folds" — the eliminated-vs-kept labeling is contingent on sampling and can flip with more data.
```

- [ ] **Step 9.2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note sampling sensitivity of NNLS coefficients under multicollinearity"
```

---

## Task 10: 全量回归检查

- [ ] **Step 10.1: 跑覆盖率检查确认新代码达到阈值**

Run: `yarn test:coverage`
Expected: lines ≥ 80 / functions ≥ 60 / branches ≥ 75 / statements ≥ 80（整体项目阈值）

如果新增代码拉低了覆盖率，追加针对 Lawson-Hanson 边界（maxIter 触发、全常量输入等）的测试。

- [ ] **Step 10.2: 跑 lint + type-check + 全量 test 做最后 sanity check**

Run: `yarn lint && yarn type-check && yarn test`
Expected: 全部通过

- [ ] **Step 10.3: 运行 build 确认生产包能打出来**

Run: `yarn build`
Expected: 构建成功，无 chunk size 告警回归

- [ ] **Step 10.4: 对照设计文档的"实施完成后的重新审计"检查清单**

手动对照 `docs/superpowers/specs/2026-04-15-stats-audit-fixes-design.md` 末尾的 8 项审计清单：

1. NNLS 正确性（Lawson-Hanson 可用、单元测试通过）
2. Bootstrap CI 合理性（stable/unstable/dropped 三分类存在）
3. Ridge 标准化生效（λ=0 vs λ=100 系数差异可见）
4. Contribution 截距可见（CorrelationAnalysis 新增 baseline 行）
5. Elasticity 警告（IncomeAttributionChart 在 samplingFraction<50% 时显示警告）
6. CLAUDE.md 文档（新段落存在）
7. `yarn test` + `yarn type-check` + `yarn lint` 全绿
8. 覆盖率达标

全部 ✅ 后提示用户"实施完成，可以重新审计"。

---

## Self-Review

### 1. Spec 覆盖检查

| 设计文档问题 | 实施任务 | 覆盖状态 |
|---|---|---|
| P0-A bootstrapCoefficientCI | Task 6 | ✅ |
| P0-A featureCorrelationMatrix | Task 7 | ✅ |
| P0-A UI 稳定性条 + 相关性矩阵 | Task 8 | ✅（实际改 `CorrelationAnalysis.tsx` 而非 spec 所写的 `IncomeAttributionChart.tsx`，见 Task 8 说明） |
| P0-B 改名 / 新增 Lawson-Hanson | Task 1 + Task 2（方案 A：`multipleLinearRegression` 保留作为兼容层，内部调 `lawsonHansonNNLS`） | ✅ |
| P0-B 单元测试 3 组 | Task 1 Step 1.1 | ✅ |
| P0-C CLAUDE.md 追加段 | Task 9 | ✅ |
| P1-A elasticityAnalysis 零值率警告 | Task 5 | ✅ |
| P1-A UI 条件弹性提示 | Task 5 Step 5.6 | ✅ |
| P1-B ridgeRegression 特征标准化 | Task 3 | ✅ |
| P1-B ridgeRegression 反变换 / 边界 | Task 3 Step 3.3 | ✅ |
| P2 contributionPercentages 返回类型变更 | Task 4 | ✅ |
| P2 CorrelationAnalysis 调用点更新 + baseline 行 | Task 4 Step 4.6 | ✅ |
| 全量测试 / 覆盖率 | Task 10 | ✅ |

### 2. Placeholder 扫描

- 无 "TBD" / "implement later"
- 每个步骤都有具体代码块或命令
- Task 8 Step 8.3/8.4 的 UI 代码完整

### 3. 类型一致性

- `lawsonHansonNNLS` 返回 `{ coefficients, r2, iterations }`；`multipleLinearRegression` 只取前两项 ✅
- `ElasticityResult` 新增字段向后兼容 ✅
- `ContributionBreakdown` 是 breaking change，在 Task 4 同步更新所有调用方 ✅
- `StabilityLabel` 类型在 Task 6 引入，Task 8 消费 ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-stats-audit-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
