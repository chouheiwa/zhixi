# 2026-04-15 · stats.ts 统计函数审计与修复

**Status**: Spec ready, pending implementation
**Owner**: @chouheiwa
**Related files**: `src/shared/stats.ts`, `src/dashboard/components/IncomeAttributionChart.tsx`, `tests/shared/stats.test.ts`（如存在）, `CLAUDE.md`

## 背景

在为"致知计划收益归因"系列文章做数据挖掘时，对 1540 条真实日收益快照 × 7 个互动指标跑了一遍插件里的 `multipleLinearRegression`，结果发现**系数在 5-fold 交叉验证下严重不稳定**：

```
特征     | fold1  fold2  fold3  fold4  fold5  | CV
collect  | 12.97  12.50  12.12  11.74  14.50  | 0.08  ✅
share    | 10.72   9.69  11.80  10.98   3.75  | 0.31
show     |  0.00   0.00   0.00   0.01   0.01  | 0.58
upvote   |  0.00   0.00   0.00   0.00   0.24  | 2.00  ❌
comment  |  0.00   6.78   3.49   0.00   0.00  | 1.33  ❌
read     |  0.00   0.00   0.00   0.00   0.00  | （始终剔除）
like     |  0.00   0.00   0.00   0.00   0.00  | （始终剔除）
```

根因是特征之间的 Pearson 相关性普遍 > 0.6（`show ↔ upvote` 甚至到 0.957），NNLS 在这种多重共线性下本身就不稳定。但插件现在给用户显示的是"单点系数 + 单点 R²"，用户打开 `IncomeAttributionChart` 看到 **"点赞贡献 0%"**，以为这是确定性结论，实际上数据切一下就可能变成 0.24。这是一个**会误导真实用户的统计呈现问题**。

顺带追溯到另外五个相关问题。这份文档把六个问题按优先级列清楚，逐个给修复方案和验收标准，供单独实施。实施完成后重新审计验证。

## 目标

1. **稳定性可视化**：用户在看单个系数之前，必须先看到它的采样稳定性（bootstrap CI）和特征之间的共线性强度
2. **算法命名诚实**：`multipleLinearRegression` 当前注释说自己是 "NNLS" 但实际是启发式前向剔除。要么改名，要么加 KKT 验证 + Lawson-Hanson fallback
3. **弹性分析偏差可见**：`elasticityAnalysis` 对零值率高的特征（like / comment）做选择偏差估计，用户需要看到警告
4. **Ridge 能真正起作用**：当前实现因为特征尺度差异没有对任何实际数据产生正则化效果，要加标准化
5. **贡献度的截距透明化**：`contributionPercentages` 静默吞掉截距，需要把 baseline 作为显式项返回
6. **CLAUDE.md 知识库补齐**：现有 "NNLS multicollinearity caveat" 只说"会清零共线特征"，没说"即使剩下的特征系数也是样本敏感的"

## 非目标（本次不做）

- 不替换整套回归引擎。保留 `multipleLinearRegression` 的 API 形状，只在内部增强
- 不对已经稳定的 `pearsonCorrelation` / `spearmanCorrelation` / `exponentialDecayFit` / `holtForecast` 等函数做任何改动
- 不重写 `IncomeAttributionChart` 的布局，只补充新的子组件（相关性矩阵 + CI 条）
- 不改数据库 schema 或 Dexie 版本
- 不对 `interactionRegression` / `quantileRegression` 等尚未进入 UI 的函数做改动

---

## 问题 P0-A：UI 上缺少稳健性指示器

### 当前症状

`IncomeAttributionChart.tsx` 对用户展示"收益归因"时，调用 `multipleLinearRegression` + `contributionPercentages`，得到一组单点贡献百分比（如 collect 73.7% / share 17.9% / ...）并直接可视化。**用户看不到**：

1. 这些系数在重采样下会波动多少
2. 哪几个特征高度共线（信号来自同一来源）
3. 样本量是否足够支撑这个结论

### 影响

用户会把 "upvote 贡献 0%" 当成确定性结论——但这只是"当前采样里 NNLS 剔除了 upvote"。下次多抓几天数据，结论可能完全变。这是**统计呈现上的根本误导**。

### 修复方案

在 `src/shared/stats.ts` 新增两个函数：

#### 1. `bootstrapCoefficientCI`

```typescript
/**
 * Bootstrap confidence intervals for regression coefficients.
 *
 * Runs the regression B times on resampled-with-replacement data and returns
 * the sampling distribution of each coefficient as (lo, median, hi) percentiles.
 *
 * Use this to communicate coefficient uncertainty to users before showing a
 * single point estimate. Especially critical under multicollinearity, where
 * point estimates are unstable across samples.
 *
 * @param xs - Array of feature arrays
 * @param y - Target array
 * @param regressionFn - Regression function (e.g. multipleLinearRegression)
 * @param B - Number of bootstrap iterations (default 200)
 * @param ciLevel - Confidence level in (0, 1), default 0.95
 * @returns Per-coefficient CI as { lo, median, hi } arrays (includes intercept at index 0)
 */
export function bootstrapCoefficientCI(
  xs: number[][],
  y: number[],
  regressionFn: (xs: number[][], y: number[]) => { coefficients: number[]; r2: number },
  B: number = 200,
  ciLevel: number = 0.95,
): { lo: number[]; median: number[]; hi: number[]; stability: ('stable' | 'unstable' | 'dropped')[] };
```

**实现要点**：
- 每次 bootstrap 用 `with replacement` 从原 `y.length` 行里抽样等长的索引
- 基于抽样后的 `xs`/`y` 调用 `regressionFn`，收集 `coefficients`
- 对每个系数 j 排序后取 `(1-ciLevel)/2` 和 `(1+ciLevel)/2` 分位数作为 lo/hi
- **稳定性分类**（第四个返回字段）：
  - `dropped`: B 次里 ≥ 95% 的系数是 0（特征被持续剔除）
  - `stable`: `|median| > 0` 且 `(hi - lo) / |median| < 0.5`
  - `unstable`: 其他情况（含 "有时剔除有时不剔除"）

**性能**：B=200 × 回归（~1540 行 × 7 特征）在浏览器上大概 <500ms，可接受。如需优化可用 Web Worker。

#### 2. `featureCorrelationMatrix`

```typescript
/**
 * Pairwise Pearson correlation matrix between features.
 * Returns a p×p symmetric matrix where entry [i][j] = corr(xs[i], xs[j]).
 * Diagonal is always 1. Useful for diagnosing multicollinearity before
 * interpreting multivariate regression coefficients.
 */
export function featureCorrelationMatrix(xs: number[][]): number[][];
```

**实现要点**：
- 直接复用 `pearsonCorrelation`
- 对称矩阵，只算上三角再镜像

### UI 改动（`IncomeAttributionChart.tsx`）

在现有的贡献度可视化（饼图或条状图）**上方**加一个"稳健性指示条"：

```
┌─────────────────────────────────────────────────────┐
│ 采样稳定性 (200 次 bootstrap, 95% CI)                │
│                                                     │
│ collect   [▓▓▓▓▓▓▓▓▓]  12.4 (11.0 - 14.8)  ✅ 稳定 │
│ share     [▓▓▓▓▓▓]     10.0 ( 5.2 - 13.1)  ✅ 稳定 │
│ comment   [▓░░░░]       1.7 ( 0.0 -  6.8)  ⚠️ 不稳定│
│ show      [░░░]         0.0 ( 0.0 -  0.01) ⚠️ 边缘 │
│ upvote    [ ]           0.0 ( 0.0 -  0.24) ⚠️ 不稳定│
│ read      [ ]           0.0 ( 0.0 -  0.00) ❌ 始终剔除│
│ like      [ ]           0.0 ( 0.0 -  0.00) ❌ 始终剔除│
└─────────────────────────────────────────────────────┘
```

在"特征相关性"折叠面板里显示 7×7 相关性矩阵的热力图，让用户看到共线性来源。

**下方**保留现有的饼图/贡献度可视化，但**标题改成**："当前样本下的贡献度估计（请先查看上方的采样稳定性）"。

### 验收标准

1. `bootstrapCoefficientCI` 对**一个已知的完全线性数据**（y = 2·x1 + 3·x2 + noise）应返回稳定 CI（lo 和 hi 差距 < 1），两个系数的 median 都接近 2 和 3。
2. 对**本次审计用的 1540×7 真实数据**应该复现上面的 CV 分类：collect 稳定、share 稳定、upvote 不稳定、read 始终剔除。
3. `featureCorrelationMatrix` 对上面真实数据应该正确识别出至少 10 对 r > 0.7 的配对。
4. UI 在收益归因面板里能同时渲染"稳定性条"和"贡献度饼图"，并且稳定性条对"始终剔除"的特征显示专门图标。
5. 没有抓到数据的空账号（Demo 模式）不会崩，降级成"数据不足，至少需要 20 个日快照才能展示稳健性分析"的提示。

---

## 问题 P0-B：`multipleLinearRegression` 名字不对，且算法有理论缺陷

### 当前症状

`src/shared/stats.ts:31` 的注释：

```typescript
/**
 * Non-negative multiple linear regression (NNLS).
 * ...
 * Uses iterative elimination: OLS → remove features with negative coefficients → re-fit.
 */
```

但实际算法是"迭代前向剔除"（fit OLS, drop all negatives, refit, repeat）。这和真 NNLS（Lawson-Hanson 活动集方法）有两个本质区别：

1. **真 NNLS 允许被剔除的特征重新激活**：如果后续迭代中某个已被移出 active set 的特征的梯度变成正数，它应该被重新加回来
2. **真 NNLS 验证 KKT 条件**：最终解必须满足"对所有 x_j = 0 的 j，`A^T(b - Ax)_j ≤ 0`"

插件的实现不做这两件事。它会一次性剔除一批负系数特征，且不检查收敛性。

### 影响

**数据上恰好没问题**：对 1540 × 7 真实数据，插件版本和参考 Lawson-Hanson 实现的 7 个系数全部匹配到 4 位小数。但这是运气。

**在其他数据上可能出错**：当多个特征的负系数在联合剔除后"换号"时，插件会错过更优解。没有单元测试覆盖这种病态情形。

**用户信任**：函数名写 "NNLS"，但严格说它不是。学过统计的用户会误以为这个函数有 NNLS 的最优性保证，实际没有。

### 修复方案

**三选一**（我推荐方案 A）：

#### 方案 A（推荐）：改名 + 新增真 NNLS，UI 默认用真 NNLS

1. 把现有 `multipleLinearRegression` **重命名**为 `iterativelyPrunedOLS`，更新 JSDoc 注释说明"这是一个启发式方法，不是真 NNLS，不保证最优"
2. 新增 `lawsonHansonNNLS(xs, y, maxIter = 1000)` 作为真 NNLS 实现
3. 保留 `multipleLinearRegression` 作为**导出名称**，但内部调用 `lawsonHansonNNLS`（做 API 兼容层，避免现有 UI / 测试一次性全挂）
4. 所有**新增**的 UI 代码用 `lawsonHansonNNLS`，旧代码用 `multipleLinearRegression` 自动受益

**Lawson-Hanson 参考实现**（tmp/ 里已经验证过的，可以直接搬到 `src/shared/stats.ts`）：

```typescript
/**
 * Lawson-Hanson non-negative least squares.
 * Solves: min ||Ax - b||² s.t. x >= 0
 *
 * Guaranteed to find the global optimum of the constrained problem.
 * Unlike the iterative elimination heuristic, this algorithm:
 *   1. Uses an active set method with exchange rule
 *   2. Verifies KKT conditions at convergence
 *   3. Allows dropped features to re-enter the active set
 *
 * Reference: Lawson, C.L. and Hanson, R.J. (1974)
 *   Solving Least Squares Problems, SIAM.
 */
export function lawsonHansonNNLS(
  xs: number[][],
  y: number[],
  maxIter: number = 1000,
  tol: number = 1e-10,
): { coefficients: number[]; r2: number; iterations: number };
```

内部用行矩阵表示 + active set P / R，每次内循环用 `solveLinearSystem` 求子集的 OLS。完整实现在 `tmp/nnls-reference.cjs` 里有一份可以直接移植（80 行左右，已经过测试）。

#### 方案 B：保留启发式但加 KKT 验证 + fallback

只改 `multipleLinearRegression`，在迭代剔除结束后加一段：

```typescript
// Verify KKT conditions: for all eliminated features, gradient should be <= 0
const residuals = y.map((yi, i) => {
  let pred = finalCoeffs[0];
  for (let j = 0; j < xs.length; j++) pred += finalCoeffs[j + 1] * xs[j][i];
  return yi - pred;
});
for (let j = 0; j < xs.length; j++) {
  if (finalCoeffs[j + 1] === 0) {
    let gradient = 0;
    for (let i = 0; i < y.length; i++) gradient += xs[j][i] * residuals[i];
    if (gradient > 1e-6) {
      // KKT violated — the heuristic got stuck. Fall back to true NNLS.
      console.warn(`multipleLinearRegression: heuristic terminated at non-optimal solution (KKT violated at feature ${j}, gradient = ${gradient}). Falling back to Lawson-Hanson.`);
      return lawsonHansonNNLS(xs, y);
    }
  }
}
```

**比方案 A 简单，但两份算法都要维护**。

#### 方案 C：只改注释

把 JSDoc 里的 "NNLS" 删掉，改成 "Iteratively pruned OLS for non-negative output"。**最少改动，但实际上没解决算法缺陷**。不推荐。

### 验收标准（假设选方案 A）

1. `lawsonHansonNNLS` 对以下三组测试都通过：
   - **Test 1**：已知闭式解 y = 2·x1 + 3·x2，A = [[1,0],[0,1],[1,1],[2,1]], b = [2,3,5,7]。期望：`x = [2, 3]`，`rss = 0`
   - **Test 2**：OLS 会给负系数 y = x1 - x2，A = [[1,0],[0,1],[1,1],[2,1]], b = [1,-1,0,1]。期望：`x2 = 0`（被约束），`x1 ≥ 0`
   - **Test 3**：多重共线性 x1 ≈ x2, y = 2·x1 + noise。期望：一个系数为 0 另一个 ≈ 2
2. `lawsonHansonNNLS` 对真实 1540×7 数据的输出和旧 `multipleLinearRegression` 的输出**完全一致**（±1e-4）——这是当前数据集的已验证性质
3. `multipleLinearRegression` 作为兼容层导出，内部调用 `lawsonHansonNNLS`，所有现有调用处不需改
4. `IncomeAttributionChart.tsx` 在生产数据上不出现回归错误
5. 现有单元测试全部通过（如果已有的话，需要做一次全量 `yarn test`）

---

## 问题 P0-C：CLAUDE.md 的 NNLS caveat 需要补强

### 当前状态

现有 CLAUDE.md 有一段：

> **NNLS multicollinearity caveat**: `multipleLinearRegression` + `contributionPercentages` will zero out highly correlated features (e.g. PV vs upvotes). For attribution UIs that must show non-zero contributions for every feature, prefer `elasticityAnalysis` (independent per-feature log-log regression)

### 缺失

这段只说"会清零共线特征"，没说两个更深的问题：

1. **即使剩下的非零特征系数也是采样敏感的**——同样的数据 + 不同的 5-fold 切分，同一个特征可能在 4 折里被剔除、1 折里有系数 0.24。单点输出必须配 bootstrap CI。
2. **高度共线时，"谁被剔除谁保留"是算法偶然性**——比如 show/read/upvote 在本数据上都 > 0.9 两两相关，NNLS 选择了保留 show 剔除 read/upvote，但这只是因为 OLS 初始化时 show 的负系数最小。换一个数据集可能剔除不同的特征。

### 修复方案

在现有 caveat 段之后追加：

```markdown
**Additionally**: On highly-correlated interaction features (any pair with `|r| > 0.7`), the non-zero coefficients from `multipleLinearRegression` are also sample-sensitive. A single-point output like "collect contributes 73.7%" has non-trivial variance under resampling. Any UI displaying regression coefficients on such data MUST also display `bootstrapCoefficientCI` confidence intervals, and should show the `featureCorrelationMatrix` so users can see the collinearity that is causing the instability.

When writing about regression results in user-facing content (articles, blog posts, documentation), do NOT claim "X is eliminated" or "X contributes 0%" as definitive statements. Instead, frame it as "under the current 4-month sample, X's coefficient is 0 in N out of K cross-validation folds". The eliminated-vs-kept labeling is contingent on sampling.
```

### 验收标准

1. CLAUDE.md 新增段落存在且位置紧跟原 caveat
2. 引用到了 `bootstrapCoefficientCI` 和 `featureCorrelationMatrix` 两个新函数
3. 对未来生成的文章/文档内容提供了具体约束（"不要说 X 被完全剔除"）

---

## 问题 P1-A：`elasticityAnalysis` 的零值过滤导致选择偏差

### 当前症状

`src/shared/stats.ts:174` 的 `elasticityAnalysis` 对每个特征独立拟合 log-log 回归，过滤 `x ≤ 0 或 y ≤ 0` 的样本对后拟合。

对**零值率高**的特征（like 86%, comment 82%, share 55%），这等于只用 14%-45% 的数据。返回的弹性不是"全数据的边际效应"，而是"在非零条件下的条件弹性"。用户看不到这个区别。

实测数字：

```
特征       零值率   有效样本   插件 β     log(x+1) β    差距
collect    17.0%    1278       1.018      1.175          0.157
upvote     27.5%    1117       1.084      1.101          0.017
share      55.3%     689       1.043      1.250          0.207
comment    82.2%     274       1.017      1.417          0.400
like       85.6%     222       1.469      2.025          0.556
```

零值率越高，两种方法分歧越大。用户选任意一种都是可辩护的，但**选择偏差是隐式的**。

### 修复方案

修改 `elasticityAnalysis` 的返回类型：

```typescript
export interface ElasticityResult {
  elasticities: number[];         // existing: per-feature β (filter-based)
  r2s: number[];                  // existing: per-feature R²
  nUsed: number[];                // new: valid sample count per feature
  totalN: number;                 // new: total sample count in input
  samplingFraction: number[];     // new: nUsed[i] / totalN
  conditionalWarnings: string[];  // new: human-readable warnings
}
```

`conditionalWarnings` 的产生规则：

```typescript
for (let i = 0; i < xs.length; i++) {
  if (nUsed[i] / totalN < 0.5) {
    warnings.push(
      `Feature ${i}: only ${nUsed[i]}/${totalN} samples used (${(nUsed[i]/totalN*100).toFixed(0)}%). ` +
      `Elasticity ${elasticities[i].toFixed(3)} is conditional on x > 0, not a marginal effect. ` +
      `Consider alternative estimators for zero-inflated features.`
    );
  }
}
```

**可选**：新增一个并列函数 `laplaceElasticityAnalysis`，用 `log(x + 1)` 和 `log(y + 1)` 而不过滤任何样本，返回 "Laplace-smoothed elasticity"。UI 可以让用户在两种版本之间切换。**这个是 P1 可选增强，不强制。**

### UI 改动（`IncomeAttributionChart.tsx` 或相邻面板）

在弹性表格旁边显示"有效样本"列和条件提示：

```
指标     弹性 β    R²      有效样本     注
collect  1.018    0.841   n=1278      ✅ 样本充足
upvote   1.084    0.651   n=1117      ✅ 样本充足
share    1.043    0.636   n= 689      ⚠️ 仅非零互动时的条件弹性
comment  1.017    0.288   n= 274      ⚠️ 仅非零互动时的条件弹性（样本小）
like     1.469    0.382   n= 222      ⚠️ 仅非零互动时的条件弹性（样本小）
```

### 验收标准

1. `ElasticityResult` 接口新增 3 个字段，现有调用者只看 `elasticities` 和 `r2s` 的不会破坏
2. 零值率 > 50% 的特征会产生 `conditionalWarnings`
3. `IncomeAttributionChart` 或相邻组件在表格里显示 `nUsed` 列和样本量警告图标
4. 现有单元测试继续通过

---

## 问题 P1-B：`ridgeRegression` 未标准化特征，等同 OLS

### 当前症状

`src/shared/stats.ts:429` 的 `ridgeRegression` 在 `XtX` 对角线加 λ：

```typescript
for (let j = 1; j < cols; j++) XtX[j][j] += lambda;
```

但特征尺度差异巨大。真实数据里：

```
特征       mean       var              XtX diag (≈ n×E[x²])
show       2504.92    129,253,789      208,713,783,828
read        525.83      8,652,937       10,812,091,023
upvote        6.85       1,133              1,745,108
comment       0.67          8.77                13,532
like          0.31          2.16                 1,485
```

当 λ = 1.0 加到 `show` 的对角项 (~2 × 10¹¹) 上，**相对缩放是 5 × 10⁻¹²**——几乎等于没加。对 `like` 的对角项 (~1485) 加 1 也只有 0.07% 的影响。

**结果**：ridge 在真实数据上等同 OLS（我的对照脚本验证了 collect 系数 0.859 vs OLS 0.861，差异 < 0.01）。**λ 不起任何作用**，不管用户传多大。

### 修复方案

在 `ridgeRegression` 内部先对特征做 z-score 标准化，求解后反变换回原尺度：

```typescript
export function ridgeRegression(
  xs: number[][],
  y: number[],
  lambda: number = 1.0,
): { coefficients: number[]; r2: number } {
  const n = y.length;
  const p = xs.length;

  if (n < 2) return { coefficients: new Array(p + 1).fill(0), r2: 0 };

  // Step 1: compute feature means and stds
  const means = xs.map((x) => x.reduce((a, b) => a + b, 0) / n);
  const stds = xs.map((x, i) => {
    const variance = x.reduce((s, v) => s + (v - means[i]) ** 2, 0) / n;
    return Math.sqrt(variance) || 1; // protect against zero variance
  });

  // Step 2: standardize features
  const xsStd = xs.map((x, i) => x.map((v) => (v - means[i]) / stds[i]));

  // Step 3: solve on standardized features
  const cols = p + 1;
  const XtX: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const Xty: number[] = new Array(cols).fill(0);

  for (let i = 0; i < n; i++) {
    const row = [1, ...xsStd.map((x) => x[i])];
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < cols; k++) XtX[j][k] += row[j] * row[k];
      Xty[j] += row[j] * y[i];
    }
  }

  // Apply ridge penalty on standardized features (now all on same scale)
  for (let j = 1; j < cols; j++) XtX[j][j] += lambda;

  const stdCoeffs = solveLinearSystem(XtX, Xty);
  if (!stdCoeffs) return { coefficients: new Array(cols).fill(0), r2: 0 };

  // Step 4: un-standardize coefficients
  // On standardized scale: y = b0_std + Σ b_j_std * (x_j - mean_j) / std_j
  //                          = (b0_std - Σ b_j_std * mean_j / std_j) + Σ (b_j_std / std_j) * x_j
  const finalCoeffs = new Array(cols).fill(0);
  let interceptCorrection = stdCoeffs[0];
  for (let j = 0; j < p; j++) {
    finalCoeffs[j + 1] = stdCoeffs[j + 1] / stds[j];
    interceptCorrection -= stdCoeffs[j + 1] * means[j] / stds[j];
  }
  finalCoeffs[0] = interceptCorrection;

  // Step 5: compute R² on original scale
  let yMean = 0;
  for (let i = 0; i < n; i++) yMean += y[i];
  yMean /= n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    let pred = finalCoeffs[0];
    for (let j = 0; j < p; j++) pred += finalCoeffs[j + 1] * xs[j][i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  return { coefficients: finalCoeffs, r2: ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot) };
}
```

### 关于 λ 的 API 含义

现在 λ 的语义变成"**对标准化后特征**的正则化强度"，对用户更直观：

- `λ = 0`: 等价 OLS
- `λ = 1`: 轻度正则化（每个标准化特征都有 1 单位的 L2 惩罚）
- `λ = 10`: 中度正则化
- `λ = 100`: 强正则化

默认值 `λ = 1.0` 对于标准化后的特征是一个**合理的中等强度**，和当前"事实上是 0"的行为完全不同。

### 验收标准

1. 新版 `ridgeRegression` 对**标准测试集**（随机生成的 100 样本 × 3 特征 + 噪声）在 λ=0 时返回 OLS 结果，λ=100 时返回明显收缩的系数
2. 对真实 1540×7 数据，λ=1 时的收藏系数**明显不同于** OLS（原来是 0.859 ≈ OLS 0.861，新版应该有可见的收缩，比如 0.75-0.85 之间）
3. 反变换正确：预测值（`intercept + Σ β_i · x_i`）和原始尺度的 y 对齐
4. **调用者（如果有）注意**：`interactionRegression` 内部调用 `ridgeRegression(allXs, y, 0.5)`，修复后行为会变。需要重新核对 `interactionRegression` 在 UI 上是否有使用，如果有，要重新测

---

## 问题 P2：`contributionPercentages` 忽略截距

### 当前症状

`src/shared/stats.ts:225`：

```typescript
export function contributionPercentages(coefficients: number[], xs: number[][]): number[] {
  const contributions = xs.map((x, i) => {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    return Math.max(0, coefficients[i + 1] * mean);
  });
  const total = contributions.reduce((a, b) => a + b, 0);
  if (total === 0) return contributions.map(() => 0);
  return contributions.map((c) => (c / total) * 100);
}
```

问题：
1. **分母里没有截距**——归一到 100% 的"总和"只是特征贡献之和，截距项 `β_0` 被静默忽略
2. **用 `max(0, ...)` 把负系数强行归零**——对输入来自 NNLS 的情况是无害的（NNLS 不产生负系数），但对输入来自 OLS/Ridge 可能是的情况会静默失真

### 影响

对本次审计数据影响很小（截距 0.16 分 vs 总均值 165.9 分，占比 0.09%），但：
- 其他用户的数据可能有更大的截距
- 用户看到 "collect 73.7% / share 17.9% / ... = 总计 100%" 会以为"这 100% 就是我收益的全部组成"，**实际上不是**——还有一个基础底数没算进去

### 修复方案

修改 `contributionPercentages` 的返回类型和行为：

```typescript
export interface ContributionBreakdown {
  /** Per-feature contribution as a percentage of predicted mean income. */
  featurePercentages: number[];
  /** Intercept (baseline) contribution as a percentage. */
  baselinePercentage: number;
  /** Raw decomposition: intercept + Σ β_i * mean(x_i), in original y units. */
  absoluteContributions: { baseline: number; features: number[] };
  /** Warning if any coefficient is negative (indicates non-NNLS input). */
  hasNegativeCoefficients: boolean;
}

export function contributionPercentages(
  coefficients: number[],
  xs: number[][],
): ContributionBreakdown {
  const p = xs.length;
  const intercept = coefficients[0];
  const means = xs.map((x) => x.reduce((a, b) => a + b, 0) / x.length);

  const rawFeatureContribs = means.map((m, i) => coefficients[i + 1] * m);
  const hasNeg = rawFeatureContribs.some((c) => c < 0);

  // Total predicted income at feature means
  const totalPredicted = intercept + rawFeatureContribs.reduce((a, b) => a + b, 0);

  if (totalPredicted === 0) {
    return {
      featurePercentages: new Array(p).fill(0),
      baselinePercentage: 0,
      absoluteContributions: { baseline: intercept, features: rawFeatureContribs },
      hasNegativeCoefficients: hasNeg,
    };
  }

  return {
    featurePercentages: rawFeatureContribs.map((c) => (c / totalPredicted) * 100),
    baselinePercentage: (intercept / totalPredicted) * 100,
    absoluteContributions: { baseline: intercept, features: rawFeatureContribs },
    hasNegativeCoefficients: hasNeg,
  };
}
```

**向后兼容性**：这是一个 breaking change（返回类型从 `number[]` 变成 `ContributionBreakdown`）。所有调用者需要更新。

**调用者更新**（`IncomeAttributionChart.tsx`）：

```typescript
// Before:
const contribs = contributionPercentages(coefficients, xs);
// contribs[0] = 73.7, contribs[1] = 17.9, ...

// After:
const { featurePercentages, baselinePercentage, absoluteContributions, hasNegativeCoefficients } 
  = contributionPercentages(coefficients, xs);
// featurePercentages[0] = 73.7, baselinePercentage = 0.09 (now shown)
```

UI 里在贡献度饼图的图例末尾加一项：**"基础底数 (baseline): 0.09% = 0.16 分/天"**。

### 验收标准

1. 返回类型变成 `ContributionBreakdown`
2. 对截距 ≠ 0 的回归结果，`baselinePercentage` 正确反映截距占预测均值的比例
3. `featurePercentages.sum + baselinePercentage === 100` (在数值精度下)
4. 对有负系数的输入（比如用 `ridgeRegression` 的输出），`hasNegativeCoefficients = true` 且 UI 显示警告
5. `IncomeAttributionChart.tsx` 的饼图多一个"基础底数"切片（即使很小也要显示）

---

## 实施顺序建议

按以下顺序实施可以保证每一步都可以独立测试通过：

1. **P0-B（改名 + Lawson-Hanson 参考实现）**——先把真 NNLS 加进去，老函数作为兼容层调它。保证现有 UI 不破坏。加单元测试。
2. **P1-B（ridge 标准化）**——独立改动，不影响其他函数。加单元测试。
3. **P2（contributionPercentages 返回类型变更）**——breaking change，需要同步更新 UI 调用处。
4. **P1-A（elasticityAnalysis 警告字段）**——加新字段不破坏老接口。
5. **P0-A（bootstrapCoefficientCI + featureCorrelationMatrix + UI 改动）**——这是最大的工作量，建议放最后。需要做 UI 设计。
6. **P0-C（CLAUDE.md 文档）**——最后补文档。

---

## 测试计划

每个 P0/P1 问题在 `tests/shared/stats.test.ts` 里新增相应测试（如果测试文件还不存在就建）：

| 问题 | 新增测试 | 目的 |
|---|---|---|
| P0-A | `bootstrapCoefficientCI_stable_data` | 单纯线性数据的 CI 应该收窄 |
| P0-A | `bootstrapCoefficientCI_collinear_data` | 共线性数据应该产生宽 CI |
| P0-A | `featureCorrelationMatrix_known_values` | 已知相关性应该被准确复现 |
| P0-B | `lawsonHansonNNLS_exact_solution` | 已知闭式解的精确性 |
| P0-B | `lawsonHansonNNLS_negative_ols` | OLS 会给负系数时 NNLS 正确约束 |
| P0-B | `lawsonHansonNNLS_multicollinear` | 多重共线性时的稳定输出 |
| P0-B | `multipleLinearRegression_backward_compat` | 旧 API 调用不破坏 |
| P1-A | `elasticityAnalysis_low_zero_rate_no_warning` | 零值率低的特征不产生警告 |
| P1-A | `elasticityAnalysis_high_zero_rate_warns` | 零值率高的特征产生警告 |
| P1-B | `ridgeRegression_lambda_zero_equals_ols` | λ=0 时等价 OLS |
| P1-B | `ridgeRegression_large_lambda_shrinks` | 大 λ 时系数明显收缩 |
| P1-B | `ridgeRegression_unstandardized_coeffs_reverse_correctly` | 反变换的数值正确性 |
| P2 | `contributionPercentages_sum_to_100` | 特征 + baseline = 100% |
| P2 | `contributionPercentages_negative_coeffs_warns` | 有负系数时 hasNegativeCoefficients=true |

**覆盖率要求**：新增代码 lines ≥ 80% / funcs ≥ 60% / branches ≥ 75% / stmts ≥ 80%（保持项目默认）。

**全量回归**：实施完每个 P0/P1 之后都要跑一遍 `yarn test`，确保现有 591 个测试不破坏。

---

## 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| `multipleLinearRegression` 改成 Lawson-Hanson 后，某些边界数据（比如样本 < 3）行为变化 | 中 | 中 | P0-B 内部保留启发式作为 fallback，只在正常情况下调 Lawson-Hanson |
| `contributionPercentages` 返回类型变更破坏现有 `IncomeAttributionChart` 调用 | 高 | 中 | 实施 P2 时必须同步改 UI，`yarn build` + `yarn type-check` 会立刻报错 |
| `ridgeRegression` 标准化后的 λ 默认值改变行为，导致 `interactionRegression` 输出变化 | 中 | 低 | 检查 `interactionRegression` 是否进了 UI，如果没有可以暂时不动；如果进了要重新核准 |
| bootstrap CI 跑 200 次回归在移动端卡顿 | 中 | 低 | 第一版用 `useMemo` 缓存结果 + 首次计算时显示 skeleton。如果有性能问题再改 Web Worker |
| UI 同时显示"单点值"和"CI"让用户看不懂 | 低 | 中 | 用明确的图标：✅ 稳定 / ⚠️ 不稳定 / ❌ 始终剔除，配 tooltip 解释 |

---

## 实施完成后的重新审计

用户实施完成后，我会重新跑以下检查：

1. **NNLS 正确性**：再对 1540×7 真实数据跑一次，和 Lawson-Hanson 参考实现对比系数
2. **Bootstrap CI 合理性**：对同一份数据跑 5-fold CV + `bootstrapCoefficientCI`，确认 CV 不稳定的特征（upvote / comment）在 CI 上也显示宽区间
3. **Ridge 标准化生效**：λ=0 vs λ=100 的系数应该有显著差异，且预测值正确
4. **Contribution 截距可见**：UI 显示 baseline 切片
5. **Elasticity 警告**：high-zero-rate 特征显示警告
6. **CLAUDE.md 文档**：新段落存在且位置正确
7. **全量测试**：`yarn test` + `yarn type-check` + `yarn lint` 全绿
8. **覆盖率**：新增代码的测试覆盖率达到项目阈值

---

## 附录：审计原始数据

原审计脚本和参考实现在 `tmp/plugin-stats.cjs`（插件函数的 Node 移植版）和 `tmp/nnls-reference.cjs`（Lawson-Hanson 参考实现）。使用的数据集是 `tmp/zhixi-backup-2026-04-14.json`（用户自己的 4 个月知乎致知计划数据导出，1540 条日收益快照 + 22822 条逐日互动）。

实施过程中如果需要复用审计用的跑分脚本（比如验证 NNLS 正确性或 bootstrap CI 行为），可以直接参考那两个文件的实现。它们不进生产代码路径，只在 `tmp/` 里作为对照。
