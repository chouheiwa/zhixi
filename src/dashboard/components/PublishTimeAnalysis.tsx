import React, { useMemo } from 'react';
import { Card, Alert } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';
import { parseDateString } from '@/shared/date-utils';
import { themeColors } from '../theme';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';

interface PublishTooltipParam {
  name: string;
  seriesName: string;
  value: number;
}

interface Props {
  records: IncomeRecord[];
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function PublishTimeAnalysisInner({ records }: Props) {
  const currency = useCurrency();
  const analysis = useMemo(() => {
    const contentMap = new Map<
      string,
      {
        publishDate: string;
        incomes: { date: string; income: number; read: number }[];
      }
    >();

    for (const r of records) {
      const existing = contentMap.get(r.contentId);
      if (existing) {
        existing.incomes.push({ date: r.recordDate, income: r.currentIncome, read: r.currentRead });
      } else {
        contentMap.set(r.contentId, {
          publishDate: r.publishDate,
          incomes: [{ date: r.recordDate, income: r.currentIncome, read: r.currentRead }],
        });
      }
    }

    const dayBuckets: { income: number; read: number; count: number }[] = Array.from({ length: 7 }, () => ({
      income: 0,
      read: 0,
      count: 0,
    }));

    for (const [, content] of contentMap) {
      const pubDate = parseDateString(content.publishDate);
      const pubTime = pubDate.getTime();
      const weekEnd = pubTime + 7 * 24 * 60 * 60 * 1000;

      let firstWeekIncome = 0;
      let firstWeekRead = 0;
      for (const inc of content.incomes) {
        const incDate = parseDateString(inc.date);
        const incTime = incDate.getTime();
        if (incTime >= pubTime && incTime < weekEnd) {
          firstWeekIncome += inc.income;
          firstWeekRead += inc.read;
        }
      }

      const jsDay = pubDate.getDay();
      const isoDay = jsDay === 0 ? 6 : jsDay - 1;
      dayBuckets[isoDay].income += firstWeekIncome;
      dayBuckets[isoDay].read += firstWeekRead;
      dayBuckets[isoDay].count++;
    }

    const result = dayBuckets.map((b, i) => ({
      label: DAY_LABELS[i],
      avgIncome: b.count > 0 ? currency.convert(b.income) / b.count : 0,
      avgRead: b.count > 0 ? b.read / b.count : 0,
      count: b.count,
    }));

    const best = result.reduce((a, b) => (b.avgIncome > a.avgIncome ? b : a), result[0]);

    return { result, best };
  }, [records, currency]);

  const chartOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: PublishTooltipParam[]) => {
        const item = analysis.result.find((r) => r.label === params[0].name);
        const lines = params.map((p) =>
          p.seriesName === '平均首周收益'
            ? `${p.seriesName}: ${currency.fmtValue(p.value)}`
            : `${p.seriesName}: ${Math.round(p.value).toLocaleString()}`,
        );
        return `${params[0].name}（${item?.count ?? 0} 篇）<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['平均首周收益', '平均首周阅读'], textStyle: { fontSize: 11 }, right: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: analysis.result.map((r) => r.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(v) },
        splitNumber: 3,
      },
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10 },
        splitNumber: 3,
        position: 'right' as const,
      },
    ],
    series: [
      {
        name: '平均首周收益',
        type: 'bar',
        data: analysis.result.map((r) => r.avgIncome),
        yAxisIndex: 0,
        itemStyle: { color: themeColors.warmBlue, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 30,
      },
      {
        name: '平均首周阅读',
        type: 'line',
        data: analysis.result.map((r) => r.avgRead),
        yAxisIndex: 1,
        smooth: true,
        itemStyle: { color: themeColors.sage },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
  };

  return (
    <Card title="最佳发布时间" size="small">
      <ReactECharts option={chartOption} style={{ height: 220 }} />
      {analysis.best && analysis.best.avgIncome > 0 && (
        <Alert
          type="info"
          showIcon
          message={
            <span style={{ fontSize: 12 }}>
              建议在<b>{analysis.best.label}</b>发布，平均首周收益最高（{currency.fmtValue(analysis.best.avgIncome)}
              ，基于 {analysis.best.count} 篇统计）
            </span>
          }
          style={{ marginTop: 8 }}
        />
      )}
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
        * 预估结果仅供参考，不代表实际收益
      </div>
    </Card>
  );
}

export const PublishTimeAnalysis = React.memo(PublishTimeAnalysisInner);
