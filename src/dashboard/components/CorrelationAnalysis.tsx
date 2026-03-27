import React, { useMemo } from 'react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { pearsonCorrelation, multipleLinearRegression } from '@/shared/stats';

interface Props {
  dailyRecords: ContentDailyRecord[];
  incomeRecords: IncomeRecord[];
}

type Metric = 'pv' | 'show' | 'upvote' | 'comment' | 'collect' | 'share';

const METRIC_INFO: { key: Metric; label: string; color: string }[] = [
  { key: 'pv', label: '阅读量', color: '#1a73e8' },
  { key: 'show', label: '曝光量', color: '#999' },
  { key: 'upvote', label: '点赞', color: '#ea4335' },
  { key: 'comment', label: '评论', color: '#34a853' },
  { key: 'collect', label: '收藏', color: '#fbbc04' },
  { key: 'share', label: '分享', color: '#9c27b0' },
];

export function CorrelationAnalysis({ dailyRecords, incomeRecords }: Props) {
  const analysis = useMemo(() => {
    if (dailyRecords.length < 3) return null;

    // Align income data with daily records by date
    const incomeMap = new Map(incomeRecords.map(r => [r.recordDate, r.currentIncome / 100]));
    const dates = dailyRecords.map(r => r.date);
    const incomeValues = dates.map(d => incomeMap.get(d) ?? 0);

    // Skip if all income is 0
    if (incomeValues.every(v => v === 0)) return null;

    // 1. Pearson correlation for each metric
    const correlations = METRIC_INFO.map(({ key, label, color }) => {
      const metricValues = dailyRecords.map(r => r[key]);
      const r = pearsonCorrelation(metricValues, incomeValues);
      return { key, label, color, r };
    }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    // 2. Multiple linear regression
    const xs = METRIC_INFO.map(({ key }) => dailyRecords.map(r => r[key]));
    const regression = multipleLinearRegression(xs, incomeValues);

    const weights = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      weight: regression.coefficients[i + 1],
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    return { correlations, regression, weights };
  }, [dailyRecords, incomeRecords]);

  if (!analysis) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 16px' }}>收益相关性分析</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Pearson Correlation */}
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            皮尔逊相关系数
            <span style={{ fontSize: 11, color: '#999', fontWeight: 400, marginLeft: 6 }}>
              越接近 1 越正相关
            </span>
          </div>
          {analysis.correlations.map(({ key, label, color, r }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: r >= 0 ? '50%' : `${50 + r * 50}%`,
                  width: `${Math.abs(r) * 50}%`,
                  height: '100%',
                  background: r >= 0 ? color : '#d32f2f',
                  borderRadius: 8,
                }} />
                <div style={{
                  position: 'absolute', left: '50%', top: 0, bottom: 0,
                  width: 1, background: '#ccc',
                }} />
              </div>
              <div style={{
                width: 45, fontSize: 12, textAlign: 'right', fontWeight: 600,
                color: Math.abs(r) > 0.7 ? '#333' : Math.abs(r) > 0.4 ? '#666' : '#999',
              }}>
                {r.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Regression Weights */}
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            回归贡献权重
            <span style={{ fontSize: 11, color: '#999', fontWeight: 400, marginLeft: 6 }}>
              每单位指标带来的收益变化
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
            R² = {analysis.regression.r2.toFixed(3)}
            <span style={{ marginLeft: 8 }}>
              {analysis.regression.r2 > 0.7 ? '拟合度高' : analysis.regression.r2 > 0.4 ? '拟合度中等' : '拟合度较低'}
            </span>
          </div>
          {analysis.weights.map(({ key, label, color, weight }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11,
                  background: weight > 0 ? `${color}20` : '#ffebee',
                  color: weight > 0 ? color : '#d32f2f',
                }}>
                  {weight > 0 ? '+' : ''}{weight.toFixed(4)} 元
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>
                {Math.abs(weight) > 0.1 ? '显著' : Math.abs(weight) > 0.01 ? '一般' : '微弱'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
