import React, { useMemo, useState, useEffect } from 'react';
import type { IncomeRecord, ContentDailyRecord } from '@/shared/types';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  multipleLinearRegression,
  elasticityAnalysis,
  contributionPercentages,
} from '@/shared/stats';

interface Props {
  records: IncomeRecord[];
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

interface AggregatedContent {
  contentToken: string;
  title: string;
  totalIncome: number;
  pv: number;
  show: number;
  upvote: number;
  comment: number;
  collect: number;
  share: number;
}

export function GlobalCorrelationAnalysis({ records }: Props) {
  const { user } = useCurrentUser();
  const [dailyData, setDailyData] = useState<ContentDailyRecord[]>([]);

  // Load all content daily records for this user
  useEffect(() => {
    if (!user) return;
    db.contentDaily.where('userId').equals(user.id).toArray().then(setDailyData);
  }, [user]);

  // Aggregate per content: sum daily metrics + sum income
  const aggregated = useMemo(() => {
    if (dailyData.length === 0) return [];

    // Sum daily metrics per contentToken
    const dailyMap = new Map<string, { pv: number; show: number; upvote: number; comment: number; collect: number; share: number; title: string }>();
    for (const r of dailyData) {
      const existing = dailyMap.get(r.contentToken);
      if (existing) {
        existing.pv += r.pv;
        existing.show += r.show;
        existing.upvote += r.upvote;
        existing.comment += r.comment;
        existing.collect += r.collect;
        existing.share += r.share;
      } else {
        dailyMap.set(r.contentToken, {
          pv: r.pv, show: r.show, upvote: r.upvote,
          comment: r.comment, collect: r.collect, share: r.share,
          title: r.title,
        });
      }
    }

    // Sum income per contentToken (from income records, map contentToken)
    const incomeMap = new Map<string, number>();
    for (const r of records) {
      incomeMap.set(r.contentToken, (incomeMap.get(r.contentToken) ?? 0) + r.currentIncome);
    }

    // Merge: only content that has both daily data and income data
    const result: AggregatedContent[] = [];
    for (const [token, metrics] of dailyMap) {
      const income = incomeMap.get(token);
      if (income === undefined) continue;
      result.push({
        contentToken: token,
        title: metrics.title,
        totalIncome: income / 100,
        ...metrics,
      });
    }

    return result;
  }, [dailyData, records]);

  const analysis = useMemo(() => {
    if (aggregated.length < 3) return null;

    const incomeValues = aggregated.map(a => a.totalIncome);
    if (incomeValues.every(v => v === 0)) return null;

    const xs = METRIC_INFO.map(({ key }) => aggregated.map(a => a[key]));

    // Correlations
    const correlations = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      pearson: pearsonCorrelation(xs[i], incomeValues),
      spearman: spearmanCorrelation(xs[i], incomeValues),
    })).sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

    // NNLS regression
    const regression = multipleLinearRegression(xs, incomeValues);
    const weights = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      weight: regression.coefficients[i + 1],
    })).sort((a, b) => b.weight - a.weight);

    // Contribution
    const contribPcts = contributionPercentages(regression.coefficients, xs);
    const contributions = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color, pct: contribPcts[i],
    })).sort((a, b) => b.pct - a.pct);

    // Elasticity
    const elastic = elasticityAnalysis(xs, incomeValues);
    const elasticities = METRIC_INFO.map(({ key, label, color }, i) => ({
      key, label, color,
      elasticity: elastic.elasticities[i],
      r2: elastic.r2s[i],
    })).sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));

    return { correlations, regression, weights, contributions, elasticities, contentCount: aggregated.length };
  }, [aggregated]);

  if (!analysis) {
    return (
      <div style={{ background: '#fafafa', borderRadius: 8, padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
        跨内容分析需要至少 3 篇内容的每日详情数据，请在内容明细表中批量拉取详情
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>跨内容收益分析</h3>
        <span style={{ fontSize: 12, color: '#999' }}>基于 {analysis.contentCount} 篇内容的聚合数据</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Correlations */}
        <Card title="相关系数" subtitle="皮尔逊(线性) / 斯皮尔曼(单调)">
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

        {/* Contribution */}
        <Card title="收益贡献占比" subtitle="各指标对收益的相对贡献">
          {analysis.contributions.map(({ key, label, color, pct }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
              <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`, height: '100%',
                  background: color, borderRadius: 8,
                }} />
              </div>
              <div style={{ width: 45, fontSize: 12, textAlign: 'right', fontWeight: 600, color: pct > 10 ? '#333' : '#999' }}>
                {pct.toFixed(1)}%
              </div>
            </div>
          ))}
        </Card>

        {/* Regression */}
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

        {/* Elasticity */}
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
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
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
