import React, { useMemo } from 'react';
import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { IncomeRecord } from '@/shared/types';
import { computeRPM, simpleMovingAverage } from '@/shared/stats';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  incomeRecords: IncomeRecord[];
}

export function RPMTrendChart({ incomeRecords }: Props) {
  const currency = useCurrency();

  const chartOption = useMemo(() => {
    if (incomeRecords.length < 3) return null;

    const sorted = [...incomeRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    const dates = sorted.map((r) => r.recordDate.slice(5));
    const rpms = sorted.map((r) => computeRPM(currency.convert(r.currentIncome), r.currentRead));
    const ma7 = simpleMovingAverage(rpms, 7);

    const avgRPM = rpms.reduce((a, b) => a + b, 0) / rpms.length;

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: { name: string; value: number; seriesName: string }[]) => {
          const lines = [`${params[0].name}`];
          for (const p of params) {
            if (p.value != null) {
              lines.push(`${p.seriesName}: ${currency.rpmPfx}${p.value.toFixed(currency.precision)}${currency.rpmSfx}`);
            }
          }
          return lines.join('<br/>');
        },
      },
      legend: { data: ['RPM', '7日均线', '平均值'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
      grid: withZoomGrid({ left: 50, right: 30, top: 35, bottom: 30 }),
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 11 } },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => v.toFixed(1), fontSize: 10 },
        splitNumber: 4,
      },
      series: [
        {
          name: 'RPM',
          type: 'line',
          data: rpms.map((v) => +v.toFixed(2)),
          smooth: true,
          itemStyle: { color: themeColors.warmBlue },
          lineStyle: { width: 2 },
          areaStyle: { color: `${themeColors.warmBlue}15` },
          symbol: 'circle',
          symbolSize: 4,
        },
        {
          name: '7日均线',
          type: 'line',
          data: ma7.map((v) => (v != null ? +v.toFixed(2) : null)),
          smooth: true,
          itemStyle: { color: themeColors.amber },
          lineStyle: { width: 2, type: 'dashed' as const },
          symbol: 'none',
          connectNulls: false,
        },
        {
          name: '平均值',
          type: 'line',
          data: rpms.map(() => +avgRPM.toFixed(2)),
          itemStyle: { color: themeColors.muted },
          lineStyle: { width: 1, type: 'dashed' as const },
          symbol: 'none',
          tooltip: { show: false },
        },
      ],
      ...timeSeriesZoom,
    };
  }, [incomeRecords, currency]);

  if (!chartOption) return null;

  return (
    <Card title="千次阅读收益（RPM）趋势" size="small">
      <ReactECharts option={chartOption} style={{ height: 250 }} />
    </Card>
  );
}
