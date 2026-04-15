import React, { useMemo } from 'react';
import { Card, Empty, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { elasticityAnalysis } from '@/shared/stats';
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

    // Join daily records and income records by date
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

    const { elasticities, r2s, samplingFraction, conditionalWarnings } = elasticityAnalysis(xs, y);

    // Normalize elasticities to percentages for the bar chart
    const absElasticities = elasticities.map((e) => Math.max(0, e));
    const totalElasticity = absElasticities.reduce((a, b) => a + b, 0);
    const contributions =
      totalElasticity > 0 ? absElasticities.map((e) => (e / totalElasticity) * 100) : absElasticities.map(() => 0);

    // Find top driver by elasticity
    let topIdx = 0;
    for (let i = 1; i < elasticities.length; i++) {
      if (elasticities[i] > elasticities[topIdx]) topIdx = i;
    }

    // Use average R² across individual regressions as quality indicator
    const avgR2 = r2s.reduce((a, b) => a + b, 0) / r2s.length;

    return {
      contributions,
      elasticities,
      r2s,
      samplingFraction,
      conditionalWarnings,
      r2: avgR2,
      topDriver: METRICS[topIdx].label,
      metrics: METRICS,
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
          message="该内容的收益波动较随机，无法归因到单一指标"
          description={`模型拟合度 R² = ${result.r2.toFixed(3)}，低于 0.1 阈值`}
        />
      </Card>
    );
  }

  // Sort by contribution descending for chart
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

  /** Per-metric R² threshold below which we warn the user that the elasticity is unreliable. */
  const LOW_R2_THRESHOLD = 0.1;

  const barOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: { name: string; value: number }[]) => {
        const m = sortedMetrics.find((sm) => sm.label === params[0].name);
        if (!m) return params[0].name;
        const elasticityText =
          m.elasticity > 0.01 ? `提升 10% → 收益约提升 ${(m.elasticity * 10).toFixed(1)}%` : '提升效果不明显';
        const r2Line =
          m.elasticity > 0.01
            ? `<br/>拟合度 R² = ${m.r2.toFixed(2)}${m.r2 < LOW_R2_THRESHOLD ? '（可信度低）' : ''}`
            : '';
        return `${m.label}<br/>贡献度: ${m.contribution.toFixed(1)}%<br/>${elasticityText}${r2Line}`;
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
      extra={<span style={{ fontSize: 12, color: themeColors.muted }}>R² = {result.r2.toFixed(3)}</span>}
    >
      <div style={{ fontSize: 13, marginBottom: 12, color: themeColors.body }}>
        收益最大驱动力：<strong style={{ color: themeColors.warmBlue }}>{result.topDriver}</strong>
      </div>
      <ReactECharts option={barOption} style={{ height: 200 }} />
      <div style={{ marginTop: 12, fontSize: 12, color: themeColors.muted }}>
        {sortedMetrics.map((m) => {
          const hasSignal = m.elasticity > 0.01;
          const lowR2 = m.r2 < LOW_R2_THRESHOLD;
          return (
            <div key={m.label} style={{ marginBottom: 4 }}>
              <span style={{ color: m.color, fontWeight: 500 }}>{m.label}</span>
              {hasSignal ? `：提升 10%，收益预计提升约 ${(m.elasticity * 10).toFixed(1)}%` : '：提升效果不明显'}
              {hasSignal && (
                <>
                  <span style={{ marginLeft: 6, color: themeColors.subtle }}>· R² = {m.r2.toFixed(2)}</span>
                  {lowR2 && <span style={{ marginLeft: 4, color: themeColors.amber }}>（拟合度低，结果仅供参考）</span>}
                </>
              )}
              {m.samplingFraction < 0.5 && (
                <span style={{ marginLeft: 4, color: themeColors.amber }}>
                  {m.elasticity === 0 && m.r2 === 0
                    ? '（样本不足，未进行弹性拟合）'
                    : `（仅 ${(m.samplingFraction * 100).toFixed(0)}% 样本参与拟合，为非零条件弹性）`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {result.conditionalWarnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8, fontSize: 12 }}
          message="部分指标的弹性为非零条件估计"
          description='零值率高的指标（如分享、评论）在对数回归里只用到少量样本，结果是 "x > 0 时的条件弹性"，不代表边际效应。'
        />
      )}
      <FormulaBlock
        title="收益归因分析 — 基于弹性（Elasticity）"
        items={[
          {
            name: '统计单位（重要）',
            formula: '同一篇内容在不同日子的日间弹性',
            desc: '本图回答的是"这篇文章的某一天某指标上升 1% 时，同一天的收益提升多少 %"。这与"我哪几篇文章收益高、收藏也多"这种跨文章相关性不是同一个问题——一个指标在跨文章层面挂钩度高，在同一篇文章内的日间波动里完全可能是另一回事。例如收藏通常是"加入书签"的私人行为，不直接带来新阅读，因此在日度弹性上往往不是最大驱动力。',
          },
          {
            name: '弹性系数（log-log 回归）',
            formula: 'ln(收益) = a + β · ln(指标)',
            desc: '对每个指标独立做对数-对数线性回归，β 即弹性系数。β=0.8 意味着该指标上升 1% 时，收益约上升 0.8%。独立计算可避免多指标间的共线性干扰（例如阅读量与点赞高度相关时，多元回归可能低估阅读量的作用）。',
          },
          {
            name: '贡献度百分比（柱状图）',
            formula: '贡献度_i = max(0, βᵢ) / Σ max(0, βⱼ) × 100%',
            desc: '将所有非负弹性系数归一化为 100%，越高表示该指标对收益的边际影响越大。负弹性视为 0（提升该指标并不会推高收益）。',
          },
          {
            name: '拟合质量 R²',
            formula: '每个指标一个 R²（图表下方显示），卡片右上角为平均 R²',
            desc: 'R² 越接近 1 表示该指标与收益的对数关系越稳定。某个指标 R² < 0.1 会被标注"拟合度低，结果仅供参考"——此时它的贡献度数字虽然算得出来，但背后信号弱，不应作为决策依据。',
          },
          {
            name: '零值过滤的注意事项',
            formula: '仅在 x > 0 且 y > 0 的日子参与回归',
            desc: '日度分享、评论这类指标常有很多零值，取对数需要丢弃零值对。这会让"有分享的日子"构成一个有偏子样本（因为这些天通常也恰好是文章在被二次传播的日子），可能人为放大这类稀疏指标的弹性。结合 R² 与实际情况综合判断。',
          },
          {
            name: '数据要求',
            formula: '匹配日期 ≥ 10 天',
            desc: '需要同时具备每日指标（pv / 点赞 / 评论 / 收藏 / 分享）和每日收益，按日期 join 后至少 10 天样本才会输出结果。',
          },
        ]}
      />
    </Card>
  );
}
