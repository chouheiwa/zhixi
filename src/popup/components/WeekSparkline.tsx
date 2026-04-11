import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange, formatDate, getDateRange } from '@/shared/date-utils';
import { getCurrencyUnit, convertFromSalt, formatValue } from '@/shared/currency';

interface SparklineTooltipParam {
  name: string;
  value: number;
}

interface Props {
  summaries: DailySummary[];
}

function WeekSparklineInner({ summaries }: Props) {
  const unit = getCurrencyUnit();
  const { start, end } = getDateRange(7);
  const days = eachDayInRange(formatDate(start), formatDate(end));

  const summaryMap = new Map(summaries.map((s) => [s.date, s]));
  const incomeData = days.map((d) => convertFromSalt(summaryMap.get(d)?.totalIncome ?? 0, unit));

  const option = {
    grid: { left: 0, right: 0, top: 4, bottom: 20 },
    xAxis: {
      type: 'category' as const,
      data: days.map((d) => d.slice(5)),
      axisLabel: { fontSize: 9, color: '#999' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: { type: 'value' as const, show: false },
    series: [
      {
        type: 'bar',
        data: incomeData,
        itemStyle: { borderRadius: [3, 3, 0, 0], color: '#1a73e8' },
        barWidth: '60%',
      },
    ],
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: SparklineTooltipParam[]) => `${params[0].name}<br/>${formatValue(params[0].value, unit)}`,
    },
  };

  return <ReactECharts option={option} style={{ height: 100, width: '100%' }} />;
}

export const WeekSparkline = React.memo(WeekSparklineInner);
