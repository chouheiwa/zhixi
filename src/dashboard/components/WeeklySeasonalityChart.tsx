import React, { useMemo } from 'react';
import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { DailySummary } from '@/shared/types';
import { weeklySeasonality } from '@/shared/stats';
import { themeColors } from '../theme';
import { FormulaBlock } from './FormulaHelp';

interface SeriesTooltipParam {
  name: string;
  seriesName: string;
  value: number;
}

interface BarColorParam {
  value: number;
}

interface Props {
  summaries: DailySummary[];
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function WeeklySeasonalityChartInner({ summaries }: Props) {
  const { seasonality, bestDay, worstDay } = useMemo(() => {
    const dates = summaries.map((s) => s.date);
    const incomes = summaries.map((s) => s.totalIncome / 100);
    const reads = summaries.map((s) => s.totalRead);
    const incomeByDay = weeklySeasonality(dates, incomes);
    const readsByDay = weeklySeasonality(dates, reads);
    const order = [1, 2, 3, 4, 5, 6, 0];
    const result = order.map((i) => ({
      label: DAY_LABELS[i],
      avgIncome: incomeByDay[i].avg,
      avgReads: readsByDay[i].avg,
      count: incomeByDay[i].count,
    }));
    const sorted = [...result].sort((a, b) => b.avgIncome - a.avgIncome);
    return {
      seasonality: result,
      bestDay: sorted[0],
      worstDay: sorted[sorted.length - 1],
    };
  }, [summaries]);

  const maxIncome = Math.max(...seasonality.map((s) => s.avgIncome), 0.01);

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: SeriesTooltipParam[]) => {
        const day = params[0].name;
        const item = seasonality.find((s) => s.label === day);
        const lines = params.map(
          (p) => `${p.seriesName}: ${p.seriesName === '平均收益' ? `¥${p.value.toFixed(2)}` : p.value.toFixed(0)}`,
        );
        return `${day}（统计了 ${item?.count ?? 0} 天）<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['平均收益', '平均阅读'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 25 },
    title: { text: '哪天赚得多？', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: {
      type: 'category' as const,
      data: seasonality.map((s) => s.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` },
        splitNumber: 3,
        position: 'left' as const,
      },
      { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3, position: 'right' as const },
    ],
    series: [
      {
        name: '平均收益',
        type: 'bar',
        data: seasonality.map((s) => s.avgIncome),
        large: true,
        largeThreshold: 500,
        yAxisIndex: 0,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: (params: BarColorParam) => {
            const ratio = params.value / maxIncome;
            const r = Math.round(26 + (234 - 26) * ratio);
            const g = Math.round(115 + (67 - 115) * ratio);
            const b = Math.round(232 + (53 - 232) * ratio);
            return `rgb(${r},${g},${b})`;
          },
        },
        barMaxWidth: 30,
      },
      {
        name: '平均阅读',
        type: 'line',
        data: seasonality.map((s) => s.avgReads),
        sampling: 'lttb',
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: themeColors.sage },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
  };

  return (
    <Card title="哪天赚得多？" size="small">
      <ReactECharts option={option} style={{ height: 220 }} />
      {bestDay && worstDay && bestDay.avgIncome > 0 && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          <b>{bestDay.label}</b>平均赚最多（¥{bestDay.avgIncome.toFixed(2)}），
          <b>{worstDay.label}</b>最少（¥{worstDay.avgIncome.toFixed(2)}）
        </div>
      )}
      <FormulaBlock
        title=""
        items={[
          {
            name: '星期效应',
            formula: '某天平均收益 = Σ(该星期几所有天的收益) ÷ 该星期几出现的天数',
            desc: '把所有数据按星期几分组，分别求平均值。样本越多越准。颜色越深代表收益越高。',
          },
        ]}
      />
    </Card>
  );
}

export const WeeklySeasonalityChart = React.memo(WeeklySeasonalityChartInner);
