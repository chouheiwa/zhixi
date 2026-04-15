import React, { useMemo } from 'react';
import { Card, Empty, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import {
  ridgeRegression,
  contributionPercentages,
  bootstrapCoefficientCI,
  featureCorrelationMatrix,
} from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  dailyRecords: ContentDailyRecord[];
  incomeRecords: IncomeRecord[];
}

interface MetricDef {
  key: string;
  label: string;
  color: string;
  getter: (r: ContentDailyRecord) => number;
}

const METRICS: MetricDef[] = [
  { key: 'pv', label: '阅读量', color: themeColors.warmBlue, getter: (r) => r.pv },
  { key: 'upvote', label: '点赞', color: themeColors.warmRed, getter: (r) => r.upvote },
  { key: 'comment', label: '评论', color: themeColors.sage, getter: (r) => r.comment },
  { key: 'collect', label: '收藏', color: themeColors.amberLight, getter: (r) => r.collect },
  { key: 'share', label: '分享', color: '#8b7bb5', getter: (r) => r.share },
];

export function IncomeAttributionChart({ dailyRecords, incomeRecords }: Props) {
  const currency = useCurrency();

  const result = useMemo(() => {
    if (dailyRecords.length < 10 || incomeRecords.length < 10) return null;

    const incomeMap = new Map<string, number>();
    for (const r of incomeRecords) {
      incomeMap.set(r.recordDate, (incomeMap.get(r.recordDate) ?? 0) + r.currentIncome);
    }

    const sortedDaily = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
    const matchedDaily: ContentDailyRecord[] = [];
    const matchedIncome: number[] = [];
    for (const d of sortedDaily) {
      const inc = incomeMap.get(d.date);
      if (inc != null) {
        matchedDaily.push(d);
        matchedIncome.push(currency.convert(inc));
      }
    }

    if (matchedDaily.length < 10) return null;

    const xs = METRICS.map((m) => matchedDaily.map((r) => m.getter(r)));
    const y = matchedIncome;

    const regression = ridgeRegression(xs, y, 1.0);
    const contribBreakdown = contributionPercentages(regression.coefficients, xs);
    const coefficientCI = bootstrapCoefficientCI(
      xs,
      y,
      (featureXs, y2) => ridgeRegression(featureXs, y2, 1.0),
      100,
      0.95,
      1.0, // cvThreshold: looser than default (0.5) — Ridge on small per-article data
      // has naturally wider CIs; 1.0 means "CI width must be smaller than the
      // coefficient magnitude itself" which is a realistic stability target.
    );
    const corrMatrix = featureCorrelationMatrix(xs);

    // Top driver by contribution percentage (not elasticity)
    let topIdx = 0;
    for (let i = 1; i < contribBreakdown.featurePercentages.length; i++) {
      if (contribBreakdown.featurePercentages[i] > contribBreakdown.featurePercentages[topIdx]) {
        topIdx = i;
      }
    }

    return {
      featurePercentages: contribBreakdown.featurePercentages,
      baselinePercentage: contribBreakdown.baselinePercentage,
      absoluteBaseline: contribBreakdown.absoluteContributions.baseline,
      absoluteFeatures: contribBreakdown.absoluteContributions.features,
      hasNegativeCoefficients: contribBreakdown.hasNegativeCoefficients,
      coefficients: regression.coefficients,
      r2: regression.r2,
      coefficientCI,
      corrMatrix,
      topDriver: METRICS[topIdx].label,
      metrics: METRICS,
      sampleCount: matchedDaily.length,
    };
  }, [dailyRecords, incomeRecords, currency]);

  if (dailyRecords.length < 10 || incomeRecords.length < 10) {
    return (
      <Card title="收益归因分析" size="small">
        <Empty description="数据不足，至少需要 10 天数据" />
      </Card>
    );
  }

  if (!result) return null;

  if (result.r2 < 0.1) {
    return (
      <Card title="收益归因分析" size="small">
        <Alert
          type="info"
          showIcon
          message="该内容的收益波动较随机，无法归因到具体指标"
          description={`模型拟合度 R² = ${result.r2.toFixed(3)}，低于 0.1 阈值`}
        />
      </Card>
    );
  }

  const sortedMetrics = result.metrics
    .map((m, i) => ({
      label: m.label,
      color: m.color,
      contribution: result.featurePercentages[i],
      absolute: result.absoluteFeatures[i],
      coefficient: result.coefficients[i + 1],
      stability: result.coefficientCI.stability[i + 1],
      ciLow: result.coefficientCI.lo[i + 1],
      ciHigh: result.coefficientCI.hi[i + 1],
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const hasAnyInstability = sortedMetrics.some((m) => m.stability === 'unstable');

  const barOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: { name: string; value: number }[]) => {
        const m = sortedMetrics.find((sm) => sm.label === params[0].name);
        if (!m) return params[0].name;
        const stabilityText =
          m.stability === 'stable' ? '✅ 稳定' : m.stability === 'unstable' ? '⚠️ 不稳定' : '❌ 始终剔除';
        return (
          `${m.label}<br/>贡献度: ${m.contribution.toFixed(1)}%<br/>` +
          `绝对贡献: ${currency.fmtValue(m.absolute)}<br/>` +
          `稳定性: ${stabilityText}`
        );
      },
    },
    grid: { left: 70, right: 30, top: 10, bottom: 10 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { formatter: (v: number) => `${v}%`, fontSize: 10 },
    },
    yAxis: {
      type: 'category' as const,
      data: sortedMetrics.map((m) => m.label),
      axisLabel: { fontSize: 12 },
      inverse: true,
    },
    series: [
      {
        type: 'bar',
        data: sortedMetrics.map((m) => ({
          value: +m.contribution.toFixed(1),
          itemStyle: { color: m.color, borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right' as const,
          formatter: (p: { value: number }) => `${p.value}%`,
          fontSize: 11,
        },
      },
    ],
  };

  return (
    <Card
      title="收益归因分析"
      size="small"
      extra={
        <span style={{ fontSize: 12, color: themeColors.muted }}>
          R² = {result.r2.toFixed(3)} · n = {result.sampleCount}
        </span>
      }
    >
      <div style={{ fontSize: 13, marginBottom: 12, color: themeColors.body }}>
        收益最大驱动力：<strong style={{ color: themeColors.warmBlue }}>{result.topDriver}</strong>
      </div>
      <ReactECharts option={barOption} style={{ height: 200 }} />
      <div style={{ marginTop: 12, fontSize: 12, color: themeColors.muted }}>
        {sortedMetrics.map((m) => {
          const stabilityIcon = m.stability === 'stable' ? '✅' : m.stability === 'unstable' ? '⚠️' : '❌';
          return (
            <div key={m.label} style={{ marginBottom: 4 }}>
              <span style={{ color: m.color, fontWeight: 500 }}>{m.label}</span>
              <span style={{ marginLeft: 6 }}>
                贡献 {m.contribution.toFixed(1)}% ({currency.fmtValue(m.absolute)})
              </span>
              <span style={{ marginLeft: 6 }}>{stabilityIcon}</span>
            </div>
          );
        })}
        {/* Baseline row — always shown, even when small */}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee' }}>
          <span style={{ color: '#999', fontWeight: 500 }}>基础</span>
          <span style={{ marginLeft: 6 }}>
            {result.baselinePercentage.toFixed(1)}% ({currency.fmtValue(result.absoluteBaseline)})
          </span>
        </div>
      </div>
      {result.hasNegativeCoefficients && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8, fontSize: 12 }}
          message="部分指标被分配了负系数"
          description='Ridge 回归对高度相关的特征可能给出负系数，此时该指标的贡献度会被解读为"削弱其他指标的贡献"。建议结合稳定性图标综合判读。'
        />
      )}
      {hasAnyInstability && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8, fontSize: 12 }}
          message="部分指标的系数在重采样下不稳定"
          description="单篇文章数据量小，指标之间可能高度相关，系数对采样敏感。建议结合稳定性图标判读。"
        />
      )}
      <FormulaBlock
        title="收益归因分析 — 多元线性回归 + 贡献分解"
        items={[
          {
            name: '模型',
            formula: '收益 = β₀ + β₁·阅读量 + β₂·点赞 + β₃·评论 + β₄·收藏 + β₅·分享',
            desc: '对这篇文章的每日指标与每日收益做 Ridge 回归（L2 正则化，λ=1），β 系数表示"多 1 个单位的某指标预计带来多少分/盐粒/天"。Ridge 不会像 NNLS 那样把共线特征"整列剔除"，而是平滑分配权重，更适合单篇文章小样本。',
          },
          {
            name: '贡献度（柱状图）',
            formula: '贡献度ᵢ = βᵢ × mean(xᵢ) / (β₀ + Σⱼ βⱼ × mean(xⱼ)) × 100%',
            desc: '把每日平均预测收益拆成"基础底数 + 每个指标的 β × 均值"，归一化为 100%。回答的是"这篇文章每一天里，哪一项累积贡献最多"——和"收藏多的日子收益也高"的直觉一致。绝对值单位是 盐粒/天 或 元/天。',
          },
          {
            name: '为什么用 Ridge 而不是 NNLS',
            formula: 'NNLS → 采样敏感；Ridge → 平滑稳定',
            desc: '你这五个指标在日度层面高度相关（爆款日一起涨）。NNLS 会把共线特征"整列清零"，bootstrap 重采样时每次被清零的可能是不同特征，导致系数在 0 和峰值之间剧烈跳动。Ridge 给每个特征一个平滑的非零系数，bootstrap 稳定性好得多。全站分析 Tab 有几千条观测 + 文章之间相对独立，用 NNLS 是合适的；单篇用 Ridge。',
          },
          {
            name: '采样稳定性',
            formula: '100 次 bootstrap，95% CI，阈值 CV < 1.0',
            desc: '✅ 稳定 = 系数的 95% CI 宽度 < 中位数绝对值（换个采样基本不会翻盘）；⚠️ 不稳定 = CI 宽度大于等于中位数（数字仅供参考）。这个阈值比全站分析（CV < 0.5）宽，因为单篇数据少、天然波动大。',
          },
          {
            name: '基础底数',
            formula: 'β₀（截距）占每日预测均值的百分比',
            desc: '不归因到任何单一指标的那部分——这是回归的截距项，代表"所有指标都取均值时的预测值"。通常很小，但为透明起见显式展示。',
          },
          {
            name: '数据要求',
            formula: '匹配日期 ≥ 10 天',
            desc: '需要同时具备每日指标（pv / 点赞 / 评论 / 收藏 / 分享）和每日收益，按日期 join 后至少 10 天样本才会输出结果。40 天以上通常能得到大部分稳定的系数；数据量越少越可能出现 ⚠️。',
          },
        ]}
      />
    </Card>
  );
}
