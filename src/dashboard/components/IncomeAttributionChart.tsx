import React, { useMemo } from 'react';
import { Card, Empty, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { elasticityAnalysis } from '@/shared/stats';
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

    const { elasticities, r2s } = elasticityAnalysis(xs, y);

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
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const barOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: { name: string; value: number }[]) => {
        const m = sortedMetrics.find((sm) => sm.label === params[0].name);
        if (!m) return params[0].name;
        const elasticityText =
          m.elasticity > 0.01 ? `提升 10% → 收益约提升 ${(m.elasticity * 10).toFixed(1)}%` : '提升效果不明显';
        return `${m.label}<br/>贡献度: ${m.contribution.toFixed(1)}%<br/>${elasticityText}`;
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
        {sortedMetrics.map((m) => (
          <div key={m.label} style={{ marginBottom: 4 }}>
            <span style={{ color: m.color, fontWeight: 500 }}>{m.label}</span>
            {m.elasticity > 0.01 ? `：提升 10%，收益预计提升约 ${(m.elasticity * 10).toFixed(1)}%` : '：提升效果不明显'}
          </div>
        ))}
      </div>
    </Card>
  );
}
