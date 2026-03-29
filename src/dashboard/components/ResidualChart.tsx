import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { IncomeRecord, ContentDailyRecord } from '@/shared/types';
import { ridgeRegression, residualAnalysis, detectAnomalies } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';

interface Props {
  incomeRecords: IncomeRecord[];
  dailyRecords: ContentDailyRecord[];
}

export function ResidualChart({ incomeRecords, dailyRecords }: Props) {
  const analysis = useMemo(() => {
    if (dailyRecords.length < 5 || incomeRecords.length < 5) return null;

    const dailyMap = new Map(dailyRecords.map(r => [r.date, r]));
    const incomeMap = new Map(incomeRecords.map(r => [r.recordDate, r]));

    const alignedDates: string[] = [];
    const incomes: number[] = [];
    const pvs: number[] = [];
    const upvotes: number[] = [];
    const comments: number[] = [];
    const collects: number[] = [];
    const shares: number[] = [];

    for (const [date, daily] of dailyMap) {
      const income = incomeMap.get(date);
      if (!income) continue;
      alignedDates.push(date);
      incomes.push(income.currentIncome / 100);
      pvs.push(daily.pv);
      upvotes.push(daily.upvote);
      comments.push(daily.comment);
      collects.push(daily.collect);
      shares.push(daily.share);
    }

    if (alignedDates.length < 5) return null;

    const xs = [pvs, upvotes, comments, collects, shares];
    const ridge = ridgeRegression(xs, incomes, 0.5);
    const { predicted, residuals, mape } = residualAnalysis(xs, incomes, ridge.coefficients);
    const anomalies = detectAnomalies(residuals, 1.5, alignedDates);

    const accuracy = (1 - mape / 100) * 100;

    return { alignedDates, incomes, predicted, residuals, mape, anomalies, r2: ridge.r2, accuracy };
  }, [incomeRecords, dailyRecords]);

  if (!analysis) {
    return (
      <div style={{ background: '#fafafa', borderRadius: 8, padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
        需要同时拥有每日详情数据和收益数据（至少5天）才能进行预测分析
      </div>
    );
  }

  const dates = analysis.alignedDates.map(d => d.slice(5));

  const predVsActualOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['实际收益', '根据指标预测'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    title: { text: '预测准不准？', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` }, splitNumber: 3 },
    series: [
      {
        name: '实际收益',
        type: 'line',
        data: analysis.incomes,
        itemStyle: { color: '#1a73e8' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: '根据指标预测',
        type: 'line',
        data: analysis.predicted,
        itemStyle: { color: '#ea4335' },
        lineStyle: { width: 2, type: 'dashed' },
        symbol: 'none',
      },
    ],
  ...timeSeriesZoom,
  };

  const residualOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const idx = params[0].dataIndex;
        const date = analysis.alignedDates[idx];
        const resid = analysis.residuals[idx];
        const anomaly = analysis.anomalies.find(a => a.index === idx);
        let text = `${date}<br/>偏差: ${resid > 0 ? '多赚了' : '少赚了'} ¥${Math.abs(resid).toFixed(2)}`;
        if (anomaly) text += `<br/><b>收益${anomaly.zScore > 0 ? '异常偏高' : '异常偏低'}，可能有特殊原因</b>`;
        return text;
      },
    },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    title: { text: '哪些天的收益无法解释？', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` }, splitNumber: 3 },
    series: [
      {
        type: 'bar',
        data: analysis.residuals.map((v, i) => {
          const isAnomaly = analysis.anomalies.some(a => a.index === i);
          return {
            value: v,
            itemStyle: {
              color: isAnomaly
                ? (v > 0 ? 'rgba(52, 168, 83, 0.8)' : 'rgba(211, 47, 47, 0.8)')
                : (v > 0 ? 'rgba(26, 115, 232, 0.3)' : 'rgba(251, 188, 4, 0.3)'),
              borderRadius: v > 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
            },
          };
        }),
        barMaxWidth: 12,
        markLine: {
          silent: true,
          data: [{ yAxis: 0 }],
          lineStyle: { color: '#ccc' },
          label: { show: false },
        },
      },
    ],
  ...timeSeriesZoom,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>收益预测分析</h3>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
        根据阅读、点赞、评论等指标预测收益，
        {analysis.accuracy > 80 ? '预测较准确' : analysis.accuracy > 60 ? '预测有一定参考价值' : '预测仅供参考'}
        （准确度约 {analysis.accuracy.toFixed(0)}%）。
        {analysis.anomalies.length > 0 && ` 有 ${analysis.anomalies.length} 天的收益明显偏离预测（高亮标记），可能受平台推荐算法影响。`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
          <ReactECharts option={predVsActualOption} style={{ height: 220 }} />
          <div style={{ padding: '2px 8px 6px', fontSize: 10, color: '#bbb' }}>
            蓝线和红线越贴近，说明收益主要由指标决定
          </div>
        </div>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
          <ReactECharts option={residualOption} style={{ height: 220 }} />
          <div style={{ padding: '2px 8px 6px', fontSize: 10, color: '#bbb' }}>
            向上 = 比预期赚得多 | 向下 = 比预期赚得少 | 高亮 = 异常波动
          </div>
        </div>
      </div>

      <FormulaBlock title="本区域使用的计算方法" items={[
        { name: '预测模型（岭回归）', formula: '预测收益 = b₀ + b₁×阅读 + b₂×点赞 + b₃×评论 + b₄×收藏 + b₅×分享\n系数通过最小化预测误差 + 正则化惩罚求得', desc: '用这篇内容每天的各项指标（阅读、点赞等）来预测当天应该赚多少钱。如果预测和实际差距大，说明有其他因素（如平台推荐权重、内容质量分）在影响收益。' },
        { name: '准确度（R² 决定系数）', formula: 'R² = 1 - Σ(实际-预测)² ÷ Σ(实际-均值)²\n范围：0~100%', desc: 'R²=80%意味着80%的收益变化可以被指标解释，剩下20%是"运气"或其他因素。R²越高，说明收益和指标关系越紧密。' },
        { name: '异常点检测', formula: 'Z = (残差 - 残差均值) ÷ 残差标准差\n|Z| ≥ 1.5 判定为异常', desc: '残差=实际-预测。如果某天残差特别大，说明那天的收益无法被指标解释，可能受到了推荐加权、热搜等外部因素影响。' },
      ]} />
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
        * 预估结果仅供参考，不代表实际收益
      </div>
    </div>
  );
}
