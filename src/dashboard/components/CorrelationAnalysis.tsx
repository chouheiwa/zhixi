import React, { useMemo } from 'react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  multipleLinearRegression,
  elasticityAnalysis,
  contributionPercentages,
  laggedCorrelation,
} from '@/shared/stats';

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

    const incomeMap = new Map(incomeRecords.map(r => [r.recordDate, r.currentIncome / 100]));
    const dates = dailyRecords.map(r => r.date);
    const incomeValues = dates.map(d => incomeMap.get(d) ?? 0);

    if (incomeValues.every(v => v === 0)) return null;

    const xs = METRIC_INFO.map(({ key }) => dailyRecords.map(r => r[key]));

    // 1. Pearson + Spearman correlations
    const correlations = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      pearson: pearsonCorrelation(xs[i], incomeValues),
      spearman: spearmanCorrelation(xs[i], incomeValues),
    })).sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

    // 2. NNLS regression
    const regression = multipleLinearRegression(xs, incomeValues);
    const weights = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      weight: regression.coefficients[i + 1],
    })).sort((a, b) => b.weight - a.weight);

    // 3. Contribution percentages
    const contribPcts = contributionPercentages(regression.coefficients, xs);
    const contributions = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color, pct: contribPcts[i],
    })).sort((a, b) => b.pct - a.pct);

    // 4. Elasticity
    const elastic = elasticityAnalysis(xs, incomeValues);
    const elasticities = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      elasticity: elastic.elasticities[i],
      r2: elastic.r2s[i],
    })).sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));

    // 5. Time-lagged correlations
    const lagged = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      lags: laggedCorrelation(xs[i], incomeValues, 3),
    }));
    // Find which metric has the strongest lag effect
    const lagSummary = lagged.map(({ key, label, color, lags }) => {
      const bestLag = lags.reduce((best, curr) =>
        Math.abs(curr.r) > Math.abs(best.r) ? curr : best, lags[0]);
      return { key, label, color, lags, bestLag: bestLag.lag, bestR: bestLag.r };
    });

    return { correlations, regression, weights, contributions, elasticities, lagSummary };
  }, [dailyRecords, incomeRecords]);

  if (!analysis) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 16px' }}>收益相关性分析</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 1. Pearson + Spearman */}
        <Card title="相关系数" subtitle="线性(皮尔逊) / 单调(斯皮尔曼)">
          {analysis.correlations.map(({ key, label, color, pearson, spearman }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <CorrelationBar value={pearson} color={color} />
              <div style={{ width: 72, fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>
                <span style={{ color: corrColor(pearson) }}>{fmtR(pearson)}</span>
                {' / '}
                <span style={{ color: corrColor(spearman) }}>{fmtR(spearman)}</span>
              </div>
            </div>
          ))}
        </Card>

        {/* 2. Contribution Percentages (pie-like) */}
        <Card title="收益贡献占比" subtitle="各指标对收益的相对贡献">
          {analysis.contributions.map(({ key, label, color, pct }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`, height: '100%',
                  background: color, borderRadius: 8, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ width: 45, fontSize: 12, textAlign: 'right', fontWeight: 600, color: pct > 10 ? '#333' : '#999' }}>
                {pct.toFixed(1)}%
              </div>
            </div>
          ))}
        </Card>

        {/* 3. Regression Weights */}
        <Card title="回归权重 (NNLS)"
          subtitle={`R² = ${analysis.regression.r2.toFixed(3)} · ${analysis.regression.r2 > 0.7 ? '拟合度高' : analysis.regression.r2 > 0.4 ? '中等' : '较低'}`}>
          {analysis.weights.map(({ key, label, color, weight }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11,
                  background: weight > 0 ? `${color}20` : '#f5f5f5',
                  color: weight > 0 ? color : '#999',
                }}>
                  {weight > 0 ? `+${weight.toFixed(4)}` : '0'} 元/单位
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>
                {weight > 0.1 ? '显著' : weight > 0.01 ? '一般' : weight > 0 ? '微弱' : '-'}
              </div>
            </div>
          ))}
        </Card>

        {/* 4. Elasticity */}
        <Card title="弹性分析" subtitle="指标变化 1% 时收益变化的百分比">
          {analysis.elasticities.map(({ key, label, color, elasticity, r2 }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11,
                  background: `${color}15`, color,
                }}>
                  {elasticity > 0 ? '+' : ''}{elasticity.toFixed(2)}%
                </span>
                <span style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }}>
                  R²={r2.toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>
                {Math.abs(elasticity) > 0.8 ? '强弹性' : Math.abs(elasticity) > 0.3 ? '中等' : '弱弹性'}
              </div>
            </div>
          ))}
        </Card>

        {/* 5. Time Lag */}
        <Card title="时间滞后分析" subtitle="今天的指标是否影响未来的收益" fullWidth>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={thStyle}>指标</th>
                  <th style={thStyle}>当天 (lag 0)</th>
                  <th style={thStyle}>+1天</th>
                  <th style={thStyle}>+2天</th>
                  <th style={thStyle}>+3天</th>
                  <th style={thStyle}>最佳滞后</th>
                </tr>
              </thead>
              <tbody>
                {analysis.lagSummary.map(({ key, label, color, lags, bestLag, bestR }) => (
                  <tr key={key} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ ...tdStyle, color: '#666' }}>{label}</td>
                    {lags.map(({ lag, r }) => (
                      <td key={lag} style={{
                        ...tdStyle, textAlign: 'center', fontFamily: 'monospace',
                        fontWeight: lag === bestLag ? 700 : 400,
                        color: lag === bestLag ? color : corrColor(r),
                        background: lag === bestLag ? `${color}10` : undefined,
                      }}>
                        {fmtR(r)}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>
                      {bestLag === 0 ? '即时' : `+${bestLag}天`}
                      {bestLag > 0 && Math.abs(bestR) > Math.abs(lags[0].r) + 0.05 && (
                        <span style={{ color, marginLeft: 4 }}>*</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>
            * 标记表示滞后相关显著强于即时相关
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, subtitle, fullWidth, children }: {
  title: string; subtitle?: string; fullWidth?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: 16,
      gridColumn: fullWidth ? '1 / -1' : undefined,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: subtitle ? 2 : 12 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function CorrelationBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 14, background: '#eee', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        left: value >= 0 ? '50%' : `${50 + value * 50}%`,
        width: `${Math.abs(value) * 50}%`,
        height: '100%',
        background: value >= 0 ? color : '#d32f2f',
        borderRadius: 7,
      }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />
    </div>
  );
}

function fmtR(r: number): string {
  return (r >= 0 ? '+' : '') + r.toFixed(2);
}

function corrColor(r: number): string {
  const abs = Math.abs(r);
  return abs > 0.7 ? '#333' : abs > 0.4 ? '#666' : '#999';
}

const thStyle: React.CSSProperties = { padding: '6px 8px', textAlign: 'center', color: '#999', fontWeight: 400 };
const tdStyle: React.CSSProperties = { padding: '6px 8px' };
