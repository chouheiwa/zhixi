import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange } from '@/shared/date-utils';
import { computeRPM, ema, holtForecast } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';

interface Props {
  summaries: DailySummary[];
  startDate: string;
  endDate: string;
}

export function RPMForecastPanel({ summaries, startDate, endDate }: Props) {
  const days = eachDayInRange(startDate, endDate);
  const summaryMap = new Map(summaries.map(s => [s.date, s]));

  const analysis = useMemo(() => {
    const incomes = days.map(d => (summaryMap.get(d)?.totalIncome ?? 0) / 100);
    const reads = days.map(d => summaryMap.get(d)?.totalRead ?? 0);
    const rpms = days.map((_, i) => computeRPM(incomes[i], reads[i]));
    const rpmEma = ema(rpms, 7);
    const { smoothed: holtSmoothed, forecast } = holtForecast(incomes, 0.3, 0.1, 7);

    const lastDate = new Date(endDate);
    const forecastDates: string[] = [];
    for (let i = 1; i <= forecast.length; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      forecastDates.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    const forecast7Total = forecast.reduce((a, b) => a + b, 0);
    const latestRpm = rpmEma.length > 0 ? rpmEma[rpmEma.length - 1] : 0;
    const prevRpm = rpmEma.length > 7 ? rpmEma[rpmEma.length - 8] : rpmEma[0] ?? 0;
    const rpmTrend = prevRpm > 0 ? ((latestRpm - prevRpm) / prevRpm) * 100 : 0;

    return { incomes, rpms, rpmEma, holtSmoothed, forecast, forecastDates, forecast7Total, latestRpm, rpmTrend };
  }, [summaries, startDate, endDate]);

  const dates = days.map(d => d.slice(5));

  const rpmOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const lines = params.map((p: any) => `${p.seriesName}: ¥${p.value.toFixed(2)}`);
        return `${params[0].name}<br/>${lines.join('<br/>')}<br/><span style="color:#999;font-size:11px">即每1000次阅读赚的钱</span>`;
      },
    },
    legend: { data: ['每日', '7日趋势'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    title: { text: '每千次阅读收益', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(1)}` }, splitNumber: 3 },
    series: [
      {
        name: '每日',
        type: 'bar',
        data: analysis.rpms,
        itemStyle: { color: 'rgba(184, 134, 78, 0.3)', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 12,
      },
      {
        name: '7日趋势',
        type: 'line',
        data: analysis.rpmEma,
        smooth: true,
        itemStyle: { color: themeColors.warmRed },
        lineStyle: { width: 2 },
        symbol: 'none',
      },
    ],
  ...timeSeriesZoom,
  };

  const forecastOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['实际收益', '趋势线', '预测'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    title: { text: '未来一周收益预测', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: {
      type: 'category' as const,
      data: [...dates, ...analysis.forecastDates],
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` }, splitNumber: 3 },
    series: [
      {
        name: '实际收益',
        type: 'bar',
        data: [...analysis.incomes, ...new Array(analysis.forecast.length).fill(null)],
        itemStyle: { color: 'rgba(184, 134, 78, 0.25)', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 10,
      },
      {
        name: '趋势线',
        type: 'line',
        data: [...analysis.holtSmoothed, ...new Array(analysis.forecast.length).fill(null)],
        smooth: true,
        itemStyle: { color: themeColors.sage },
        lineStyle: { width: 2 },
        symbol: 'none',
      },
      {
        name: '预测',
        type: 'line',
        data: [...new Array(analysis.incomes.length - 1).fill(null), analysis.holtSmoothed[analysis.holtSmoothed.length - 1], ...analysis.forecast],
        smooth: true,
        itemStyle: { color: themeColors.warmRed },
        lineStyle: { width: 2, type: 'dashed' },
        symbol: 'none',
        areaStyle: { color: 'rgba(196, 89, 74, 0.08)' },
      },
    ],
  ...timeSeriesZoom,
  };

  return (
    <Card title="赚钱效率趋势" size="small">
      <Card size="small" style={{ background: themeColors.amberBg, border: 'none', marginBottom: 12 }}>
        <Statistic
          title="当前每千次阅读收益"
          value={analysis.latestRpm}
          precision={2}
          prefix="¥"
          valueStyle={{ color: themeColors.amber, fontFamily: '"Noto Serif SC", serif' }}
          suffix={
            <span style={{ fontSize: 12, color: analysis.rpmTrend >= 0 ? themeColors.sage : themeColors.warmRed }}>
              {analysis.rpmTrend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              {Math.abs(analysis.rpmTrend).toFixed(1)}%
            </span>
          }
        />
      </Card>
      <ReactECharts option={rpmOption} style={{ height: 220 }} />
      <FormulaBlock title="本区域使用的计算方法" items={[
        { name: '每千次阅读收益', formula: 'RPM = (当日收益 ÷ 当日阅读量) × 1000', desc: '衡量每1000次阅读能带来多少收益，数值越高说明内容变现效率越好。' },
        { name: '7日趋势线（指数移动平均 EMA）', formula: 'EMA(t) = α × 当日值 + (1-α) × 昨日EMA\nα = 2 ÷ (7+1) = 0.25', desc: '对最近7天的数据做加权平均，越近的数据权重越大。比简单平均更能反映最新趋势。' },
      ]} />
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
        * 预估结果仅供参考，不代表实际收益
      </div>
    </Card>
  );
}
