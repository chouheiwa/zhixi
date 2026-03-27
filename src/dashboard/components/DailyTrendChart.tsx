import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange } from '@/shared/date-utils';

interface Props {
  summaries: DailySummary[];
  startDate: string;
  endDate: string;
}

export function DailyTrendChart({ summaries, startDate, endDate }: Props) {
  const days = eachDayInRange(startDate, endDate);
  const summaryMap = new Map(summaries.map((s) => [s.date, s]));

  const incomeData = days.map((d) => (summaryMap.get(d)?.totalIncome ?? 0) / 100);
  const readData = days.map((d) => summaryMap.get(d)?.totalRead ?? 0);
  const interactionData = days.map((d) => summaryMap.get(d)?.totalInteraction ?? 0);

  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['收益 (元)', '阅读量', '互动量'] },
    grid: { left: 60, right: 60, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: days.map((d) => d.slice(5)),
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      { type: 'value' as const, name: '收益 (元)', position: 'left' as const },
      { type: 'value' as const, name: '数量', position: 'right' as const },
    ],
    series: [
      {
        name: '收益 (元)',
        type: 'bar',
        data: incomeData,
        yAxisIndex: 0,
        itemStyle: { color: '#1a73e8', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 30,
      },
      {
        name: '阅读量',
        type: 'line',
        data: readData,
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: '#34a853' },
        lineStyle: { width: 2 },
      },
      {
        name: '互动量',
        type: 'line',
        data: interactionData,
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: '#fbbc04' },
        lineStyle: { width: 2 },
      },
    ],
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>每日收益趋势</h3>
      <ReactECharts option={option} style={{ height: 350 }} />
    </div>
  );
}
