import React, { useMemo } from 'react';
import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import { scatterZoomToolbox } from './chartConfig';
import type { IncomeRecord } from '@/shared/types';
import { efficiencyFrontier, computeRPM } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';

interface Props {
  records: IncomeRecord[];
}

export function ConversionAnalysis({ records }: Props) {
  const { scatterData, frontierLine, avgRPM } = useMemo(() => {
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
    const items = Array.from(map.values());
    const reads = items.map((i) => i.read);
    const incomes = items.map((i) => i.income / 100);
    const totalReads = reads.reduce((a, b) => a + b, 0);
    const totalIncome = incomes.reduce((a, b) => a + b, 0);

    return {
      scatterData: items.map((item) => ({
        value: [item.read, item.income / 100],
        name: item.title,
        itemStyle: { color: item.type === 'article' ? themeColors.warmBlue : themeColors.amberLight },
      })),
      frontierLine: efficiencyFrontier(reads, incomes),
      avgRPM: computeRPM(totalIncome, totalReads),
    };
  }, [records]);

  const option = {
    ...scatterZoomToolbox,
    tooltip: {
      formatter: (params: any) => {
        if (params.seriesType === 'scatter') {
          const rpm = params.value[0] > 0 ? computeRPM(params.value[1], params.value[0]) : 0;
          return `${params.name}<br/>阅读: ${params.value[0].toLocaleString()}<br/>收益: ¥${params.value[1].toFixed(2)}<br/>每千次阅读赚 ¥${rpm.toFixed(2)}`;
        }
        return '';
      },
    },
    xAxis: { type: 'value' as const, name: '阅读量', nameLocation: 'center' as const, nameGap: 30 },
    yAxis: { type: 'value' as const, name: '收益 (元)' },
    grid: { left: 60, right: 40, top: 20, bottom: 50 },
    series: [
      { type: 'scatter', data: scatterData, symbolSize: 10, z: 2 },
      {
        type: 'line',
        data: frontierLine.map((p) => [p.x, p.y]),
        smooth: true,
        lineStyle: { color: themeColors.warmRed, width: 2, type: 'dashed' },
        itemStyle: { color: themeColors.warmRed },
        symbol: 'none',
        tooltip: { show: false },
        z: 1,
      },
    ],
  };

  return (
    <Card
      title="阅读量 vs 收益"
      size="small"
      extra={<span style={{ fontSize: 12, color: '#999' }}>平均 RPM ¥{avgRPM.toFixed(2)}</span>}
    >
      <ReactECharts option={option} style={{ height: 300 }} />
      <div style={{ fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 }}>
        每个点是一篇内容 | 红色虚线 = 同等阅读量下的最高收益线
      </div>
      <FormulaBlock
        title=""
        items={[
          {
            name: '效率前沿线',
            formula: '按阅读量从小到大排序\n保留每个阅读量级别上收益最高的点\n连线即为效率前沿',
            desc: '前沿线上的内容是"同等阅读量下赚钱最多的"。你的内容离前沿线越近，说明变现效率越高。远低于前沿线的内容可能有优化空间。',
          },
        ]}
      />
    </Card>
  );
}
