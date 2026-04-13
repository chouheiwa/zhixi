import React, { useMemo } from 'react';
import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';
import { contentTypeChartColor } from '@/shared/content-type';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';

interface RankTooltipParam {
  name: string;
  value: number;
}

interface Props {
  records: IncomeRecord[];
}

function TopContentRankingInner({ records }: Props) {
  const currency = useCurrency();
  const top10 = useMemo(() => {
    const map = new Map<string, { title: string; income: number; type: string }>();
    for (const r of records) {
      const existing = map.get(r.contentId);
      if (existing) existing.income += r.currentIncome;
      else map.set(r.contentId, { title: r.title, income: r.currentIncome, type: r.contentType });
    }
    return Array.from(map.values())
      .sort((a, b) => b.income - a.income)
      .slice(0, 10);
  }, [records]);

  const option = {
    tooltip: {
      formatter: (params: RankTooltipParam) => `${params.name}<br/>${currency.fmtValue(params.value)}`,
    },
    grid: { left: 200, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value' as const, show: false },
    yAxis: {
      type: 'category' as const,
      data: top10
        .map((item) => {
          const label = item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title;
          return label;
        })
        .reverse(),
      axisLabel: { fontSize: 11, width: 180, overflow: 'truncate' as const },
    },
    series: [
      {
        type: 'bar',
        data: top10
          .map((item) => ({
            value: currency.convert(item.income),
            itemStyle: { color: contentTypeChartColor(item.type) },
          }))
          .reverse(),
        barMaxWidth: 20,
        label: {
          show: true,
          position: 'right' as const,
          formatter: (params: RankTooltipParam) => currency.fmtValue(params.value),
          fontSize: 11,
        },
      },
    ],
  };

  return (
    <Card title="收益 Top 10" size="small">
      <ReactECharts option={option} style={{ height: Math.max(200, top10.length * 35) }} />
    </Card>
  );
}

export const TopContentRanking = React.memo(TopContentRankingInner);
