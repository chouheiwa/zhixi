import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
}

export function ConversionAnalysis({ records }: Props) {
  const scatterData = useMemo(() => {
    const map = new Map<string, { read: number; income: number; title: string; type: string }>();
    for (const r of records) {
      const existing = map.get(r.contentId);
      if (existing) {
        existing.read += r.currentRead;
        existing.income += r.currentIncome;
      } else {
        map.set(r.contentId, { read: r.currentRead, income: r.currentIncome, title: r.title, type: r.contentType });
      }
    }
    return Array.from(map.values()).map((item) => ({
      value: [item.read, item.income / 100],
      name: item.title,
      itemStyle: { color: item.type === 'article' ? '#1a73e8' : '#fbbc04' },
    }));
  }, [records]);

  const option = {
    tooltip: {
      formatter: (params: any) => `${params.name}<br/>阅读: ${params.value[0]}<br/>收益: ¥${params.value[1].toFixed(2)}`,
    },
    xAxis: { type: 'value' as const, name: '阅读量', nameLocation: 'center' as const, nameGap: 30 },
    yAxis: { type: 'value' as const, name: '收益 (元)' },
    grid: { left: 60, right: 40, top: 20, bottom: 50 },
    series: [{ type: 'scatter', data: scatterData, symbolSize: 10 }],
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>阅读-收益转化分析</h3>
      <ReactECharts option={option} style={{ height: 300 }} />
    </div>
  );
}
