import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange } from '@/shared/date-utils';

interface Props {
  summaries: DailySummary[];
  startDate: string;
  endDate: string;
}

const CHARTS: { key: keyof DailySummary; label: string; color: string; unit?: string; transform?: (v: number) => number }[] = [
  { key: 'totalIncome', label: '收益', color: '#1a73e8', unit: '元', transform: (v) => v / 100 },
  { key: 'totalRead', label: '阅读量', color: '#34a853' },
  { key: 'totalInteraction', label: '互动量', color: '#fbbc04' },
];

export function DailyTrendChart({ summaries, startDate, endDate }: Props) {
  const days = eachDayInRange(startDate, endDate);
  const summaryMap = new Map(summaries.map((s) => [s.date, s]));
  const dates = days.map((d) => d.slice(5));

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>每日趋势</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {CHARTS.map(({ key, label, color, unit, transform }) => {
          const data = days.map((d) => {
            const val = (summaryMap.get(d)?.[key] as number) ?? 0;
            return transform ? transform(val) : val;
          });

          const option = {
            tooltip: {
              trigger: 'axis' as const,
              formatter: (params: any[]) => {
                const v = params[0].value;
                return `${params[0].name}<br/>${label}: ${unit === '元' ? `¥${v.toFixed(2)}` : v.toLocaleString()}`;
              },
            },
            grid: { left: 45, right: 15, top: 25, bottom: 25 },
            title: { text: label, textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
            xAxis: {
              type: 'category' as const,
              data: dates,
              axisLabel: { fontSize: 10 },
              axisTick: { show: false },
            },
            yAxis: {
              type: 'value' as const,
              axisLabel: {
                fontSize: 10,
                formatter: unit === '元' ? (v: number) => `¥${v}` : undefined,
              },
              splitNumber: 3,
            },
            series: [
              {
                type: key === 'totalIncome' ? 'bar' : 'line',
                data,
                smooth: true,
                itemStyle: { color, borderRadius: key === 'totalIncome' ? [3, 3, 0, 0] : undefined },
                lineStyle: { width: 2 },
                areaStyle: key !== 'totalIncome' ? { color: `${color}18` } : undefined,
                barMaxWidth: 20,
              },
            ],
          };

          return (
            <div key={key} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
              <ReactECharts option={option} style={{ height: 200 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
