import React, { useMemo } from 'react';
import { Card, Tag, Flex } from 'antd';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { ContentDailyRecord } from '@/shared/types';
import { simpleMovingAverage } from '@/shared/stats';
import { themeColors } from '../theme';

interface Props {
  dailyRecords: ContentDailyRecord[];
}

interface RateMetric {
  key: string;
  label: string;
  color: string;
  getter: (r: ContentDailyRecord) => number;
}

const RATE_METRICS: RateMetric[] = [
  { key: 'upvoteRate', label: '点赞率', color: themeColors.warmRed, getter: (r) => r.upvote },
  { key: 'commentRate', label: '评论率', color: themeColors.sage, getter: (r) => r.comment },
  { key: 'collectRate', label: '收藏率', color: themeColors.amberLight, getter: (r) => r.collect },
  { key: 'shareRate', label: '分享率', color: '#8b7bb5', getter: (r) => r.share },
];

type TagColor = 'green' | 'red' | 'default';

function describeTrend(recent7: number[], prior7: number[]): { text: string; color: string; tagColor: TagColor } {
  const recentAvg = recent7.length > 0 ? recent7.reduce((a, b) => a + b, 0) / recent7.length : 0;
  const priorAvg = prior7.length > 0 ? prior7.reduce((a, b) => a + b, 0) / prior7.length : 0;

  if (priorAvg === 0) return { text: '→ 平稳', color: themeColors.muted, tagColor: 'default' as TagColor };
  const change = (recentAvg - priorAvg) / priorAvg;
  if (change > 0.2) return { text: '↑ 上升', color: themeColors.sage, tagColor: 'green' as TagColor };
  if (change < -0.2) return { text: '↓ 下降', color: themeColors.warmRed, tagColor: 'red' as TagColor };
  return { text: '→ 平稳', color: themeColors.muted, tagColor: 'default' as TagColor };
}

export function EngagementEfficiencyChart({ dailyRecords }: Props) {
  const { chartOption, trends } = useMemo(() => {
    if (dailyRecords.length < 3) return { chartOption: null, trends: [] };

    const sorted = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((r) => r.date.slice(5));

    const series: object[] = [];
    const legendData: string[] = [];
    const trendResults: { label: string; text: string; color: string; tagColor: TagColor }[] = [];

    // Build date→record map for O(1) tooltip lookups
    const dateMap = new Map<string, ContentDailyRecord>();
    for (const r of sorted) dateMap.set(r.date.slice(5), r);

    for (const m of RATE_METRICS) {
      const rates = sorted.map((r) => (r.pv > 0 ? (m.getter(r) / r.pv) * 100 : null));
      const ma7 = simpleMovingAverage(rates, 7);

      legendData.push(m.label);

      series.push({
        name: m.label,
        type: 'line',
        data: rates.map((v) => (v != null ? +v.toFixed(3) : null)),
        smooth: true,
        itemStyle: { color: m.color },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 3,
        connectNulls: false,
      });

      series.push({
        name: `${m.label} 7日均线`,
        type: 'line',
        data: ma7.map((v) => (v != null ? +v.toFixed(3) : null)),
        smooth: true,
        itemStyle: { color: m.color },
        lineStyle: { width: 1.5, type: 'dashed' as const },
        symbol: 'none',
        connectNulls: false,
      });

      // Trend analysis
      const validRates = rates.filter((v): v is number => v != null);
      const recent7 = validRates.slice(-7);
      const prior7 = validRates.slice(-14, -7);
      const trend = describeTrend(recent7, prior7);
      trendResults.push({ label: m.label, ...trend });
    }

    const option = {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: { seriesName: string; value: number | null; marker: string; axisValue: string }[]) => {
          const lines = [params[0].axisValue];
          // Group by base metric (skip MA lines)
          const record = dateMap.get(params[0].axisValue);
          for (const p of params) {
            if (p.value != null && !p.seriesName.includes('均线')) {
              const metricDef = RATE_METRICS.find((m) => m.label === p.seriesName);
              const absVal = record && metricDef ? metricDef.getter(record) : 0;
              const pv = record ? record.pv : 0;
              lines.push(`${p.marker} ${p.seriesName}: ${p.value.toFixed(2)}%（${absVal}次/${pv}PV）`);
            }
          }
          return lines.join('<br/>');
        },
      },
      legend: {
        data: legendData,
        textStyle: { fontSize: 11 },
        right: 0,
        top: 0,
      },
      grid: withZoomGrid({ left: 45, right: 20, top: 35, bottom: 30 }),
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v.toFixed(1)}%`, fontSize: 10 },
        splitNumber: 4,
      },
      series,
      ...timeSeriesZoom,
    };

    return { chartOption: option, trends: trendResults };
  }, [dailyRecords]);

  if (!chartOption) return null;

  return (
    <Card
      title="互动效率趋势"
      size="small"
      extra={
        <Flex gap={4}>
          {trends.map((t) => (
            <Tag key={t.label} color={t.tagColor} style={{ fontSize: 11 }}>
              {t.label} {t.text}
            </Tag>
          ))}
        </Flex>
      }
    >
      <ReactECharts option={chartOption} style={{ height: 300 }} />
    </Card>
  );
}
