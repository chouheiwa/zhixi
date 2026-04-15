import React, { useMemo } from 'react';
import { Card, Empty, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import {
  multipleLinearRegression,
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

    const regression = multipleLinearRegression(xs, y);
    const contribBreakdown = contributionPercentages(regression.coefficients, xs);
    const coefficientCI = bootstrapCoefficientCI(
      xs,
      y,
      (featureXs, y2) => multipleLinearRegression(featureXs, y2),
      100,
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
            desc: '对这篇文章的每日指标与每日收益做多元线性回归，β₁..β₅ 通过 NNLS（Lawson-Hanson）约束为非负。βᵢ 的含义是"多 1 个单位的某指标预计带来多少分/盐粒"。',
          },
          {
            name: '贡献度（柱状图）',
            formula: '贡献度ᵢ = βᵢ × mean(xᵢ) / (β₀ + Σⱼ βⱼ × mean(xⱼ)) × 100%',
            desc: '把预测均值拆成"基础底数 + 每个指标的 β × 该指标均值"，归一化为 100%。回答的是"这篇文章的总收益里，哪一项累积贡献最多"——这个视角和"收藏多的日子收益也高"的直觉一致。',
          },
          {
            name: '与旧版弹性分析的区别',
            formula: '绝对贡献 vs 边际弹性',
            desc: '旧版显示的是"某指标涨 1%，收益涨 β%"的弹性——这是一个敏感度问题。而"评论"、"分享"这类零值率高的指标，弹性回归只能用非零日子拟合，容易把"爆款日恰好有评论"误判成"评论带动收益"。新版直接用绝对贡献分解，结果和全站分析 Tab 的口径一致。',
          },
          {
            name: '采样稳定性',
            formula: '100 次 bootstrap，95% CI，分为 稳定/不稳定/始终剔除',
            desc: '单篇文章数据量小（一般 30-90 天），指标之间高度相关时 NNLS 会在重采样中反复切换谁入选。✅ = 系数在重采样下变化 < 50% 中位数；⚠️ = 波动较大，单点值不可靠；❌ = 被 NNLS 反复剔除。',
          },
          {
            name: '基础底数',
            formula: 'β₀（截距）占预测均值的百分比',
            desc: '这部分不来自任何单一指标——是回归截距，通常很小（< 5%）。为透明起见显式展示，避免用户误以为 100% 都被具体指标解释。',
          },
          {
            name: '数据要求',
            formula: '匹配日期 ≥ 10 天',
            desc: '需要同时具备每日指标（pv / 点赞 / 评论 / 收藏 / 分享）和每日收益，按日期 join 后至少 10 天样本才会输出结果。数据量越少系数越不稳定，稳定性图标会提示。',
          },
        ]}
      />
    </Card>
  );
}
