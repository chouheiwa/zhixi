import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
}

export function TopContentRanking({ records }: Props) {
  const top10 = useMemo(() => {
    const map = new Map<string, { title: string; income: number; type: string }>();
    for (const r of records) {
      const existing = map.get(r.contentId);
      if (existing) existing.income += r.currentIncome;
      else map.set(r.contentId, { title: r.title, income: r.currentIncome, type: r.contentType });
    }
    return Array.from(map.values()).sort((a, b) => b.income - a.income).slice(0, 10);
  }, [records]);

  const option = {
    tooltip: {
      formatter: (params: any) => `${params.name}<br/>¥${params.value.toFixed(2)}`,
    },
    grid: { left: 200, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value' as const, show: false },
    yAxis: {
      type: 'category' as const,
      data: top10.map((item) => {
        const label = item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title;
        return label;
      }).reverse(),
      axisLabel: { fontSize: 11, width: 180, overflow: 'truncate' as const },
    },
    series: [{
      type: 'bar',
      data: top10.map((item) => ({
        value: item.income / 100,
        itemStyle: { color: item.type === 'article' ? '#1a73e8' : '#fbbc04' },
      })).reverse(),
      barMaxWidth: 20,
      label: {
        show: true, position: 'right' as const,
        formatter: (params: any) => `¥${params.value.toFixed(2)}`,
        fontSize: 11,
      },
    }],
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>收益 Top 10</h3>
      <ReactECharts option={option} style={{ height: Math.max(200, top10.length * 35) }} />
    </div>
  );
}
