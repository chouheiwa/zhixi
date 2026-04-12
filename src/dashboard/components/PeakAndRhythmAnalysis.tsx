import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Empty, Flex } from 'antd';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  dailyRecords: ContentDailyRecord[];
  incomeRecords: IncomeRecord[];
  publishDate: string;
}

interface PeakInfo {
  label: string;
  peakDate: string;
  daysAfterPublish: number;
  peakValue: number;
  color: string;
  isCurrency?: boolean;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
}

export function PeakAndRhythmAnalysis({ dailyRecords, incomeRecords, publishDate }: Props) {
  const currency = useCurrency();

  const analysis = useMemo(() => {
    if (dailyRecords.length < 7 && incomeRecords.length < 7) return null;

    const sortedDaily = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
    const sortedIncome = [...incomeRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));

    // ── Peak Detection (single pass) ──
    const peaks: PeakInfo[] = [];

    const incomeMap = new Map<string, number>();
    for (const r of sortedIncome) {
      incomeMap.set(r.recordDate, r.currentIncome);
    }

    if (sortedDaily.length > 0) {
      let maxPv = 0,
        maxPvIdx = 0;
      let maxUp = 0,
        maxUpIdx = 0;
      let maxCol = 0,
        maxColIdx = 0;

      for (let i = 0; i < sortedDaily.length; i++) {
        const r = sortedDaily[i];
        if (r.pv > maxPv) {
          maxPv = r.pv;
          maxPvIdx = i;
        }
        if (r.upvote > maxUp) {
          maxUp = r.upvote;
          maxUpIdx = i;
        }
        if (r.collect > maxCol) {
          maxCol = r.collect;
          maxColIdx = i;
        }
      }

      const dailyPeaks: { label: string; idx: number; value: number; color: string }[] = [
        { label: '阅读量', idx: maxPvIdx, value: maxPv, color: themeColors.warmBlue },
        { label: '点赞', idx: maxUpIdx, value: maxUp, color: themeColors.warmRed },
        { label: '收藏', idx: maxColIdx, value: maxCol, color: themeColors.amberLight },
      ];
      for (const p of dailyPeaks) {
        peaks.push({
          label: p.label,
          peakDate: sortedDaily[p.idx].date,
          daysAfterPublish: daysBetween(publishDate, sortedDaily[p.idx].date),
          peakValue: p.value,
          color: p.color,
        });
      }
    }

    if (sortedIncome.length > 0) {
      let maxInc = 0,
        maxIncIdx = 0;
      for (let i = 0; i < sortedIncome.length; i++) {
        if (sortedIncome[i].currentIncome > maxInc) {
          maxInc = sortedIncome[i].currentIncome;
          maxIncIdx = i;
        }
      }
      peaks.push({
        label: '收益',
        peakDate: sortedIncome[maxIncIdx].recordDate,
        daysAfterPublish: daysBetween(publishDate, sortedIncome[maxIncIdx].recordDate),
        peakValue: maxInc,
        color: themeColors.amber,
        isCurrency: true,
      });
    }

    // ── Weekend vs Weekday (accumulators, O(1) space) ──
    const buckets = {
      weekday: { pvSum: 0, incSum: 0, engSum: 0, count: 0 },
      weekend: { pvSum: 0, incSum: 0, engSum: 0, count: 0 },
    };

    for (const r of sortedDaily) {
      const inc = incomeMap.get(r.date) ?? 0;
      const engRate = r.pv > 0 ? ((r.upvote + r.comment + r.collect + r.share) / r.pv) * 100 : 0;
      const bucket = isWeekend(r.date) ? buckets.weekend : buckets.weekday;
      bucket.pvSum += r.pv;
      bucket.incSum += inc;
      bucket.engSum += engRate;
      bucket.count++;
    }

    const safeAvg = (sum: number, count: number) => (count > 0 ? sum / count : 0);

    const weekdayAvgPv = safeAvg(buckets.weekday.pvSum, buckets.weekday.count);
    const weekendAvgPv = safeAvg(buckets.weekend.pvSum, buckets.weekend.count);
    const weekdayAvgInc = safeAvg(buckets.weekday.incSum, buckets.weekday.count);
    const weekendAvgInc = safeAvg(buckets.weekend.incSum, buckets.weekend.count);
    const weekdayAvgEng = safeAvg(buckets.weekday.engSum, buckets.weekday.count);
    const weekendAvgEng = safeAvg(buckets.weekend.engSum, buckets.weekend.count);

    const pvDiffPct = weekdayAvgPv > 0 ? ((weekendAvgPv - weekdayAvgPv) / weekdayAvgPv) * 100 : 0;
    const weekendConclusion =
      pvDiffPct > 10
        ? `该内容周末阅读量高出工作日 ${pvDiffPct.toFixed(0)}%`
        : pvDiffPct < -10
          ? `该内容工作日阅读量高出周末 ${Math.abs(pvDiffPct).toFixed(0)}%`
          : '该内容周末与工作日表现相近';

    // ── Day-over-Day Growth Rate ──
    // Merge daily + income by date
    const allDates = sortedDaily.map((r) => r.date);
    const pvValues = sortedDaily.map((r) => r.pv);
    const incValues = allDates.map((d) => currency.convert(incomeMap.get(d) ?? 0));

    const growthDates: string[] = [];
    const pvGrowth: (number | null)[] = [];
    const incGrowth: (number | null)[] = [];

    for (let i = 1; i < allDates.length; i++) {
      growthDates.push(allDates[i].slice(5));
      pvGrowth.push(pvValues[i - 1] > 0 ? ((pvValues[i] - pvValues[i - 1]) / pvValues[i - 1]) * 100 : null);
      incGrowth.push(incValues[i - 1] > 0 ? ((incValues[i] - incValues[i - 1]) / incValues[i - 1]) * 100 : null);
    }

    return {
      peaks,
      weekday: {
        avgPv: weekdayAvgPv,
        avgIncome: weekdayAvgInc,
        avgEngRate: weekdayAvgEng,
      },
      weekend: {
        avgPv: weekendAvgPv,
        avgIncome: weekendAvgInc,
        avgEngRate: weekendAvgEng,
      },
      weekendConclusion,
      growth: { dates: growthDates, pvGrowth, incGrowth },
    };
  }, [dailyRecords, incomeRecords, publishDate, currency]);

  if (!analysis) {
    return (
      <Card title="峰值与节奏分析" size="small">
        <Empty description="数据不足，至少需要 7 天数据" />
      </Card>
    );
  }

  // Weekend vs Weekday chart
  const weekdayWeekendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['工作日', '周末'], textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 30, top: 35, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: ['平均PV', `平均收益(${currency.suffix || currency.prefix || '元'})`, '参与率(%)'],
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '工作日',
        type: 'bar',
        data: [
          Math.round(analysis.weekday.avgPv),
          +currency.convert(analysis.weekday.avgIncome).toFixed(currency.precision),
          +analysis.weekday.avgEngRate.toFixed(2),
        ],
        itemStyle: { color: themeColors.warmBlue, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 30,
        barGap: '30%',
      },
      {
        name: '周末',
        type: 'bar',
        data: [
          Math.round(analysis.weekend.avgPv),
          +currency.convert(analysis.weekend.avgIncome).toFixed(currency.precision),
          +analysis.weekend.avgEngRate.toFixed(2),
        ],
        itemStyle: { color: themeColors.amber, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 30,
      },
    ],
  };

  // Growth rate chart
  const growthOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['PV 环比', '收益环比'], textStyle: { fontSize: 11 }, left: 'center' as const, top: 0 },
    grid: withZoomGrid({ left: 50, right: 50, top: 30, bottom: 30 }),
    xAxis: { type: 'category' as const, data: analysis.growth.dates, axisLabel: { fontSize: 10 } },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v.toFixed(0)}%`, fontSize: 10 },
        position: 'left' as const,
        splitNumber: 4,
      },
      {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v.toFixed(0)}%`, fontSize: 10 },
        position: 'right' as const,
        splitNumber: 4,
      },
    ],
    series: [
      {
        name: 'PV 环比',
        type: 'line',
        yAxisIndex: 0,
        data: analysis.growth.pvGrowth.map((v) => (v != null ? +v.toFixed(1) : null)),
        smooth: true,
        itemStyle: { color: themeColors.warmBlue },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(107, 143, 113, 0.3)' },
              { offset: 0.5, color: 'rgba(255, 255, 255, 0)' },
              { offset: 1, color: 'rgba(196, 89, 74, 0.3)' },
            ],
          },
        },
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 3,
      },
      {
        name: '收益环比',
        type: 'line',
        yAxisIndex: 1,
        data: analysis.growth.incGrowth.map((v) => (v != null ? +v.toFixed(1) : null)),
        smooth: true,
        itemStyle: { color: themeColors.amber },
        lineStyle: { width: 2 },
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 3,
      },
    ],
    ...timeSeriesZoom,
  };

  return (
    <Flex vertical gap={16}>
      {/* Peak Detection */}
      <Card title="峰值检测" size="small">
        <Row gutter={[12, 12]}>
          {analysis.peaks.map((p) => (
            <Col span={6} key={p.label}>
              <Card size="small" style={{ background: themeColors.paper }}>
                <Statistic
                  title={`${p.label}峰值`}
                  value={p.isCurrency ? currency.convert(p.peakValue) : p.peakValue}
                  precision={p.isCurrency ? currency.precision : 0}
                  prefix={p.isCurrency ? currency.prefix : undefined}
                  suffix={p.isCurrency ? currency.suffix : undefined}
                  valueStyle={{ color: p.color, fontWeight: 600, fontSize: 18 }}
                />
                <div style={{ fontSize: 12, color: themeColors.muted, marginTop: 4 }}>
                  {p.peakDate.slice(5)} · {p.daysAfterPublish === 0 ? '发布当天' : `发布后第 ${p.daysAfterPublish} 天`}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Weekend vs Weekday */}
      <Card title="周末 vs 工作日" size="small">
        <ReactECharts option={weekdayWeekendOption} style={{ height: 200 }} />
        <div style={{ textAlign: 'center', fontSize: 12, color: themeColors.body, marginTop: 8 }}>
          {analysis.weekendConclusion}
        </div>
      </Card>

      {/* Growth Rate */}
      {analysis.growth.dates.length > 2 && (
        <Card title="日环比增长率" size="small">
          <ReactECharts option={growthOption} style={{ height: 250 }} />
        </Card>
      )}
    </Flex>
  );
}
