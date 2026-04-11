import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { IncomeRecord } from '@/shared/types';
import { exponentialDecayFit, powerLawDecayFit, computeRPM } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  incomeRecords: IncomeRecord[];
}

export function LifecycleAnalysis({ incomeRecords }: Props) {
  const currency = useCurrency();
  const analysis = useMemo(() => {
    if (incomeRecords.length < 5) return null;

    const sorted = [...incomeRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    const incomes = sorted.map((r) => currency.convert(r.currentIncome));
    const dates = sorted.map((r) => r.recordDate);
    const reads = sorted.map((r) => r.currentRead);
    const rpms = sorted.map((_, i) => computeRPM(incomes[i], reads[i]));

    const expFit = exponentialDecayFit(incomes);
    const powFit = powerLawDecayFit(incomes);

    const firstNDays = 7;
    const earlySum = incomes.slice(0, Math.min(firstNDays, incomes.length)).reduce((a, b) => a + b, 0);
    const totalSum = incomes.reduce((a, b) => a + b, 0);
    const multiplier = earlySum > 0 ? totalSum / earlySum : 0;

    const cumulative: number[] = [];
    let cum = 0;
    for (const v of incomes) {
      cum += v;
      cumulative.push(cum);
    }

    const expCurve = expFit ? incomes.map((_, i) => expFit.A * Math.exp(-expFit.lambda * i)) : [];
    const powCurve = powFit ? incomes.map((_, i) => powFit.A * Math.pow(i + 1, -powFit.alpha)) : [];

    return {
      incomes,
      dates,
      rpms,
      expFit,
      powFit,
      multiplier,
      cumulative,
      expCurve,
      powCurve,
      earlySum,
      totalSum,
      firstNDays,
    };
  }, [incomeRecords, currency]);

  if (!analysis) {
    return (
      <div
        style={{
          background: '#fafafa',
          borderRadius: 8,
          padding: 20,
          textAlign: 'center',
          color: '#999',
          fontSize: 13,
        }}
      >
        需要至少 5 天的收益数据才能分析内容生命周期
      </div>
    );
  }

  const dates = analysis.dates.map((d) => d.slice(5));

  const decayOption = {
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: ['实际收益', ...(analysis.expFit ? ['趋势线'] : []), ...(analysis.powFit ? ['长尾趋势'] : [])],
      textStyle: { fontSize: 11 },
      right: 0,
      top: 0,
    },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    title: { text: '收益随时间的变化', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(v) },
      splitNumber: 3,
    },
    series: [
      {
        name: '实际收益',
        type: 'bar',
        data: analysis.incomes,
        itemStyle: { color: 'rgba(91, 122, 157, 0.3)', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 12,
      },
      ...(analysis.expFit
        ? [
            {
              name: '趋势线',
              type: 'line',
              data: analysis.expCurve,
              smooth: true,
              lineStyle: { color: themeColors.warmRed, width: 2 },
              itemStyle: { color: themeColors.warmRed },
              symbol: 'none',
            },
          ]
        : []),
      ...(analysis.powFit
        ? [
            {
              name: '长尾趋势',
              type: 'line',
              data: analysis.powCurve,
              smooth: true,
              lineStyle: { color: '#8b7bb5', width: 2, type: 'dashed' as const },
              itemStyle: { color: '#8b7bb5' },
              symbol: 'none',
            },
          ]
        : []),
    ],
    ...timeSeriesZoom,
  };

  const cumulativeOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['累计总收益', '每千次阅读收益'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 50, top: 30, bottom: 25 }),
    title: { text: '累计收益趋势', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(v) },
        splitNumber: 3,
        position: 'left' as const,
      },
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(v) },
        splitNumber: 3,
        position: 'right' as const,
      },
    ],
    series: [
      {
        name: '累计总收益',
        type: 'line',
        data: analysis.cumulative,
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: themeColors.warmBlue },
        lineStyle: { width: 2 },
        areaStyle: { color: 'rgba(91, 122, 157, 0.1)' },
        symbol: 'none',
      },
      {
        name: '每千次阅读收益',
        type: 'line',
        data: analysis.rpms,
        smooth: true,
        yAxisIndex: 1,
        itemStyle: { color: themeColors.amberLight },
        lineStyle: { width: 2 },
        symbol: 'none',
      },
    ],
    ...timeSeriesZoom,
  };

  const bestFit =
    analysis.expFit && analysis.powFit
      ? analysis.expFit.r2 >= analysis.powFit.r2
        ? 'exp'
        : 'pow'
      : analysis.expFit
        ? 'exp'
        : 'pow';

  // Generate user-friendly lifecycle description
  const lifecycleDesc = (() => {
    const parts: string[] = [];
    if (analysis.expFit) {
      const hl = analysis.expFit.halfLife;
      parts.push(`这篇内容的收益大约每 ${hl.toFixed(0)} 天减半`);
      if (hl < 7) parts.push('属于短命型内容，收益集中在发布初期');
      else if (hl < 30) parts.push('生命周期中等');
      else parts.push('属于长青型内容，可以持续带来收益');
    }
    if (analysis.powFit && bestFit === 'pow') {
      if (analysis.powFit.alpha < 0.5) parts.push('这篇内容有长尾效应，老了还能赚钱');
    }
    return parts.join('。');
  })();

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>这篇内容还能赚多久？</h3>
      {lifecycleDesc && <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>{lifecycleDesc}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {analysis.expFit && (
          <>
            <MiniCard
              label="收益减半时间"
              value={`${analysis.expFit.halfLife.toFixed(0)} 天`}
              sub={analysis.expFit.halfLife < 7 ? '衰减较快' : analysis.expFit.halfLife < 30 ? '衰减适中' : '衰减很慢'}
              highlight={bestFit === 'exp'}
            />
            <MiniCard
              label="预估总收益"
              value={`${currency.prefix}${analysis.expFit.ltv.toFixed(currency.precision)}${currency.suffix}`}
              sub="按当前衰减速度推算"
            />
          </>
        )}
        {analysis.powFit && (
          <MiniCard
            label="长尾程度"
            value={analysis.powFit.alpha < 0.5 ? '强长尾' : analysis.powFit.alpha < 1 ? '中等' : '快速衰减'}
            sub={
              analysis.powFit.alpha < 0.5
                ? '老内容仍有持续收益'
                : analysis.powFit.alpha < 1
                  ? '收益逐渐减少'
                  : '收益很快归零'
            }
            highlight={bestFit === 'pow'}
          />
        )}
        <MiniCard
          label="前7天 vs 总收益"
          value={`${analysis.multiplier.toFixed(1)} 倍`}
          sub={`前7天赚了 ${currency.prefix}${analysis.earlySum.toFixed(currency.precision)}${currency.suffix}，总共 ${currency.prefix}${analysis.totalSum.toFixed(currency.precision)}${currency.suffix}`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
          <ReactECharts option={decayOption} style={{ height: 220 }} />
        </div>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
          <ReactECharts option={cumulativeOption} style={{ height: 220 }} />
        </div>
      </div>

      <FormulaBlock
        title="本区域使用的计算方法"
        items={[
          {
            name: '收益减半时间（指数衰减拟合）',
            formula: '收益(t) = A × e^(-λt)\n半衰期 = ln(2) ÷ λ\n预估总收益 = A ÷ λ',
            desc: '假设收益按固定比例逐日递减（就像放射性衰变一样）。A是初始收益强度，λ是衰减速度。对ln(收益)和天数做线性回归来求A和λ。半衰期就是收益降到一半所需的天数。',
          },
          {
            name: '长尾程度（幂律衰减拟合）',
            formula: '收益(t) = A × t^(-α)\nα < 0.5: 强长尾  α > 1: 快速衰减',
            desc: '有些内容不是指数衰减，而是"开始降得快，后面降得慢"，老文章还能细水长流。α越小长尾效应越强。对ln(收益)和ln(天数)做线性回归来求α。',
          },
          {
            name: '前7天倍数',
            formula: '倍数 = 总收益 ÷ 前7天收益',
            desc: `一个简单的经验指标：如果你的内容前7天赚了${currency.prefix}10${currency.suffix}，倍数是3倍，那总收益大约是${currency.prefix}30${currency.suffix}。可以用历史内容的平均倍数来预测新内容的总收益。`,
          },
        ]}
      />
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
        * 预估结果仅供参考，不代表实际收益
      </div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? themeColors.warmBlue : themeColors.paper,
        color: highlight ? '#fff' : '#333',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
