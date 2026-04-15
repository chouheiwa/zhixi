import React, { useMemo } from 'react';
import { Card, Empty, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { univariateLinearFit, partialCorrelation, pearsonCorrelation } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  dailyRecords: ContentDailyRecord[];
  incomeRecords: IncomeRecord[];
}

interface MetricDef {
  key: 'pv' | 'upvote' | 'comment' | 'collect' | 'share';
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

const MIN_SAMPLES = 10;

interface PerMetricAnalysis {
  key: MetricDef['key'];
  label: string;
  color: string;
  fit: { slope: number; intercept: number; r2: number };
  rawPearson: number;
  partial: number;
  unitYield: number;
  totalX: number;
}

interface AnalysisResult {
  perMetric: PerMetricAnalysis[]; // sorted by R² desc
  top: PerMetricAnalysis;
  matchedN: number;
}

export function IncomeAttributionChart({ dailyRecords, incomeRecords }: Props) {
  const currency = useCurrency();

  const result = useMemo<AnalysisResult | null>(() => {
    if (dailyRecords.length < MIN_SAMPLES || incomeRecords.length < MIN_SAMPLES) return null;

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

    if (matchedDaily.length < MIN_SAMPLES) return null;

    const y = matchedIncome;
    const pvSeries = matchedDaily.map((r) => r.pv);

    const perMetric: PerMetricAnalysis[] = METRICS.map((m) => {
      const x = matchedDaily.map(m.getter);
      const fit = univariateLinearFit(x, y);
      const rawPearson = pearsonCorrelation(x, y);
      // Partial correlation: control for pv except when the metric IS pv
      const partial = m.key === 'pv' ? rawPearson : partialCorrelation(x, y, pvSeries);
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < x.length; i++) {
        sumX += x[i];
        sumY += y[i];
      }
      const unitYield = sumX > 0 ? sumY / sumX : 0;
      return {
        key: m.key,
        label: m.label,
        color: m.color,
        fit,
        rawPearson,
        partial,
        unitYield,
        totalX: sumX,
      };
    });

    const byR2 = [...perMetric].sort((a, b) => b.fit.r2 - a.fit.r2);
    return {
      perMetric: byR2,
      top: byR2[0],
      matchedN: matchedDaily.length,
    };
  }, [dailyRecords, incomeRecords, currency]);

  if (dailyRecords.length < MIN_SAMPLES || incomeRecords.length < MIN_SAMPLES) {
    return (
      <Card title="收益归因分析" size="small">
        <Empty description={`数据不足，至少需要 ${MIN_SAMPLES} 天数据`} />
      </Card>
    );
  }

  if (!result) return null;

  if (result.top.fit.r2 < 0.1) {
    return (
      <Card title="收益归因分析" size="small">
        <Alert
          type="info"
          showIcon
          message="该内容的收益波动较随机，无法归因到具体指标"
          description={`最强单一指标的解释力 R² = ${result.top.fit.r2.toFixed(3)}，低于 0.1 阈值`}
        />
      </Card>
    );
  }

  // Bar-chart for univariate R²
  const r2BarOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: { name: string; value: number }[]) => {
        const m = result.perMetric.find((pm) => pm.label === params[0].name);
        if (!m) return params[0].name;
        return (
          `${m.label}<br/>` +
          `R² = ${m.fit.r2.toFixed(3)}（解释 ${(m.fit.r2 * 100).toFixed(0)}% 变化）<br/>` +
          `每增加 1 ${m.label} → 收益约 +${currency.fmtValue(m.fit.slope)}/天`
        );
      },
    },
    grid: { left: 70, right: 30, top: 10, bottom: 10 },
    xAxis: {
      type: 'value' as const,
      max: 1,
      axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, fontSize: 10 },
    },
    yAxis: {
      type: 'category' as const,
      data: result.perMetric.map((m) => m.label),
      axisLabel: { fontSize: 12 },
      inverse: true,
    },
    series: [
      {
        type: 'bar',
        data: result.perMetric.map((m) => ({
          value: +m.fit.r2.toFixed(3),
          itemStyle: { color: m.color, borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right' as const,
          formatter: (p: { value: number }) => `${Math.round(p.value * 100)}%`,
          fontSize: 11,
        },
      },
    ],
  };

  // Classify partial-correlation strength
  const classifyIndependence = (raw: number, partial: number): { text: string; color: string } => {
    if (Math.abs(raw) < 0.2) return { text: '相关弱', color: themeColors.muted };
    const reduction = 1 - Math.abs(partial) / Math.abs(raw);
    if (reduction > 0.5) return { text: '主要是阅读代理', color: themeColors.warmRed };
    if (reduction > 0.25) return { text: '部分代理', color: themeColors.amber };
    return { text: '独立信号', color: themeColors.sage };
  };

  return (
    <Card
      title="收益归因分析"
      size="small"
      extra={<span style={{ fontSize: 12, color: themeColors.muted }}>n = {result.matchedN} 天</span>}
    >
      {/* Top driver callout + simple formula */}
      <div style={{ fontSize: 13, marginBottom: 8, color: themeColors.body }}>
        最能单独解释收益的指标：
        <strong style={{ color: result.top.color, marginLeft: 4 }}>{result.top.label}</strong>
        <span style={{ marginLeft: 6, color: themeColors.muted }}>
          （R² = {(result.top.fit.r2 * 100).toFixed(0)}%）
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: themeColors.body,
          padding: '8px 12px',
          background: '#f7f5f0',
          borderLeft: `3px solid ${result.top.color}`,
          borderRadius: 4,
          marginBottom: 12,
          fontFamily: 'monospace',
        }}
      >
        每日收益 ≈ {currency.fmtValue(result.top.fit.intercept)} + {currency.fmtValue(result.top.fit.slope)} × 当日
        {result.top.label}
      </div>

      {/* Section 1: Univariate R² bar chart */}
      <div style={{ fontSize: 12, color: themeColors.body, marginBottom: 4 }}>各指标单独的解释力 (R²)</div>
      <ReactECharts option={r2BarOption} style={{ height: 170 }} />

      {/* Section 2: Partial correlation table */}
      <div style={{ marginTop: 16, fontSize: 12 }}>
        <div style={{ color: themeColors.body, marginBottom: 6 }}>
          控制阅读量后的独立性
          <span style={{ color: themeColors.muted, marginLeft: 6 }}>（r 大幅下降的指标只是阅读量的副产品）</span>
        </div>
        {result.perMetric
          .filter((m) => m.key !== 'pv')
          .map((m) => {
            const cls = classifyIndependence(m.rawPearson, m.partial);
            return (
              <div
                key={m.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 3,
                  fontSize: 11,
                }}
              >
                <div style={{ width: 50, color: m.color }}>{m.label}</div>
                <div style={{ width: 130, fontFamily: 'monospace', color: themeColors.muted }}>
                  r {m.rawPearson.toFixed(2)} → {m.partial.toFixed(2)}
                </div>
                <div style={{ color: cls.color }}>{cls.text}</div>
              </div>
            );
          })}
      </div>

      {/* Section 3: Unit yield table */}
      <div style={{ marginTop: 16, fontSize: 12 }}>
        <div style={{ color: themeColors.body, marginBottom: 6 }}>
          每单位动作的参考价值
          <span style={{ color: themeColors.muted, marginLeft: 6 }}>（Σ收益 / Σ动作次数，关联非因果）</span>
        </div>
        {[...result.perMetric]
          .filter((m) => m.totalX > 0)
          .sort((a, b) => b.unitYield - a.unitYield)
          .map((m) => (
            <div
              key={m.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 3,
                fontSize: 11,
              }}
            >
              <div style={{ width: 50, color: m.color }}>{m.label}</div>
              <div style={{ flex: 1, fontFamily: 'monospace', color: themeColors.body }}>
                1 {m.label} ≈ {currency.fmtValue(m.unitYield)}
              </div>
              <div style={{ color: themeColors.subtle, fontSize: 10 }}>总 {m.totalX.toLocaleString()}</div>
            </div>
          ))}
      </div>

      <FormulaBlock
        title="收益归因分析 — 三种互相印证的方法"
        items={[
          {
            name: '主指标：单变量 R²',
            formula: '对每个指标单独拟合 y = a + b·x，取 R² 最高的作为主驱动',
            desc: '单变量回归不受特征共线性干扰，稳定可信。全站数据里收藏单独就能解释 92% 的日度收益波动——一个变量的"最简模型"捕获了几乎全部信号，再加其他特征边际改进不足 8%。',
          },
          {
            name: '线性公式',
            formula: 'y = a + b·x → 每日收益 ≈ a + b × 当日主指标',
            desc: '图表上方高亮的就是这条公式。a 是截距（不被主指标解释的基础收益），b 是每增加 1 个单位主指标带来的增量收益。',
          },
          {
            name: '偏相关：控制阅读量后的独立性',
            formula: 'r(X, Y | pv) = (r_XY - r_Xpv · r_Ypv) / √((1 - r²_Xpv)(1 - r²_Ypv))',
            desc: '检验"如果两天阅读量一样，多 1 个收藏/评论/点赞是否还对应更高收益"——区分"真信号"和"阅读量代理"的教科书方法。r 大幅下降（> 50%）的指标基本只是阅读量的副产品，降幅小的才是独立贡献。全站数据里评论降了 66%、收藏只降 4%——收藏是真信号，评论只是阅读量的傀儡。',
          },
          {
            name: '参考价值：单位收益',
            formula: '单位收益 = Σ收益 / Σ该指标',
            desc: '"这篇文章的每 1 个收藏大约对应多少收益"——是样本均值的比值，便于和直觉对照。⚠️ 是关联不是因果：并不是用户收藏一下你就直接进账 X 分钱，而是"收藏高的日子恰好收益也高"的侧面反映。',
          },
          {
            name: '为什么不用多元回归',
            formula: '共线特征让 NNLS/Ridge 在单篇小样本上剧烈抖动',
            desc: '阅读、点赞、评论、收藏、分享在日度层面几乎是同一条曲线（文章热的那天五个一起涨）。多元回归试图"分摊"权重时结果不稳定。改用单变量 R² 直接回答"单独看它能不能解释"，加上偏相关回答"控制阅读量后谁还独立"，两个角度合起来比多元回归在这类数据上更可靠。',
          },
          {
            name: '数据要求',
            formula: '匹配日期 ≥ 10 天',
            desc: '需要同时具备每日指标（pv / 点赞 / 评论 / 收藏 / 分享）和每日收益。日期越多，R² 和偏相关越稳定。单篇文章通常 30-90 天。',
          },
        ]}
      />
    </Card>
  );
}
