import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
}

export function TypeComparisonChart({ records }: Props) {
  const stats = useMemo(() => {
    const byType = new Map<string, { income: number; read: number; interaction: number; count: number }>();
    for (const r of records) {
      const existing = byType.get(r.contentType) ?? { income: 0, read: 0, interaction: 0, count: 0 };
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.interaction += r.currentInteraction;
      existing.count += 1;
      byType.set(r.contentType, existing);
    }
    return byType;
  }, [records]);

  const typeLabels: Record<string, string> = { article: '文章', answer: '回答' };
  const colors: Record<string, string> = { article: '#1a73e8', answer: '#fbbc04' };

  const pieData = Array.from(stats.entries()).map(([type, s]) => ({
    name: typeLabels[type] ?? type,
    value: s.income / 100,
  }));

  const barCategories = Array.from(stats.entries()).map(([type]) => typeLabels[type] ?? type);
  const readData = Array.from(stats.values()).map((s) => s.read);
  const interactionData = Array.from(stats.values()).map((s) => s.interaction);

  const option = {
    tooltip: { trigger: 'item' as const },
    legend: {},
    grid: [{ left: '55%', right: 40, top: 40, bottom: 30 }],
    xAxis: [{ type: 'category' as const, data: barCategories, gridIndex: 0 }],
    yAxis: [{ type: 'value' as const, gridIndex: 0 }],
    series: [
      {
        name: '收益占比', type: 'pie', radius: ['40%', '65%'], center: ['25%', '55%'],
        data: pieData, label: { formatter: '{b}\n¥{c}' },
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const types = Array.from(stats.keys());
            return colors[types[params.dataIndex]] ?? '#999';
          },
        },
      },
      { name: '阅读量', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: readData, itemStyle: { color: '#34a853' } },
      { name: '互动量', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: interactionData, itemStyle: { color: '#ea4335' } },
    ],
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>内容类型对比</h3>
      <ReactECharts option={option} style={{ height: 300 }} />
    </div>
  );
}
