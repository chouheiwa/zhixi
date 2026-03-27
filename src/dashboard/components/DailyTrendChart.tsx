import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange } from '@/shared/date-utils';

interface Props {
  summaries: DailySummary[];
  startDate: string;
  endDate: string;
}

const METRICS: { key: keyof DailySummary; label: string; color: string }[] = [
  { key: 'totalRead', label: '阅读量', color: '#34a853' },
  { key: 'totalInteraction', label: '互动量', color: '#fbbc04' },
];

export function DailyTrendChart({ summaries, startDate, endDate }: Props) {
  const days = eachDayInRange(startDate, endDate);
  const summaryMap = new Map(summaries.map((s) => [s.date, s]));
  const dates = days.map((d) => d.slice(5));
  const incomeData = days.map((d) => (summaryMap.get(d)?.totalIncome ?? 0) / 100);

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>每日趋势</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {METRICS.map(({ key, label, color }) => {
          const data = days.map((d) => (summaryMap.get(d)?.[key] as number) ?? 0);

          const option = {
            tooltip: { trigger: 'axis' as const },
            legend: { data: [label, '收益'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
            grid: { left: 50, right: 50, top: 30, bottom: 25 },
            title: { text: label, textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
            xAxis: {
              type: 'category' as const,
              data: dates,
              axisLabel: { fontSize: 10 },
              axisTick: { show: false },
            },
            yAxis: [
              { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3, position: 'left' as const },
              { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v}` }, splitNumber: 3, position: 'right' as const },
            ],
            series: [
              {
                name: label,
                type: 'line',
                data,
                smooth: true,
                yAxisIndex: 0,
                itemStyle: { color },
                lineStyle: { width: 2 },
                areaStyle: { color: `${color}18` },
              },
              {
                name: '收益',
                type: 'bar',
                data: incomeData,
                yAxisIndex: 1,
                itemStyle: { color: 'rgba(26, 115, 232, 0.25)', borderRadius: [2, 2, 0, 0] },
                barMaxWidth: 8,
              },
            ],
          };

          return (
            <div key={key} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
              <ReactECharts option={option} style={{ height: 220 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
