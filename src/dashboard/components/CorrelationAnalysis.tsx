import React, { useMemo, useState, useEffect } from 'react';
import { Card as AntCard, Row, Col } from 'antd';
import type { IncomeRecord, ContentDailyRecord } from '@/shared/types';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  multipleLinearRegression,
  elasticityAnalysis,
  contributionPercentages,
  ridgeRegression,
  interactionRegression,
  quantileRegressionPredict,
  residualAnalysis,
  computeRPM,
} from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';

interface Props {
  records: IncomeRecord[];
}

type Metric = 'pv' | 'show' | 'upvote' | 'comment' | 'collect' | 'share';

const METRIC_INFO: { key: Metric; label: string; color: string }[] = [
  { key: 'pv', label: '阅读量', color: themeColors.warmBlue },
  { key: 'show', label: '曝光量', color: '#999' },
  { key: 'upvote', label: '点赞', color: themeColors.warmRed },
  { key: 'comment', label: '评论', color: themeColors.sage },
  { key: 'collect', label: '收藏', color: themeColors.amberLight },
  { key: 'share', label: '分享', color: '#8b7bb5' },
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

function describeCorr(r: number): string {
  const abs = Math.abs(r);
  if (abs > 0.7) return '强相关';
  if (abs > 0.4) return '中等相关';
  if (abs > 0.2) return '弱相关';
  return '几乎无关';
}

function describeElasticity(e: number): string {
  if (e > 0.8) return `提升10%可多赚约${(e * 10).toFixed(1)}%`;
  if (e > 0.3) return `有一定提升效果`;
  return '提升效果不明显';
}

export function GlobalCorrelationAnalysis({ records }: Props) {
  const { user } = useCurrentUser();
  const currency = useCurrency();
  const [dailyData, setDailyData] = useState<ContentDailyRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    db.contentDaily.where('userId').equals(user.id).toArray().then(setDailyData);
  }, [user]);

  const aggregated = useMemo(() => {
    if (dailyData.length === 0) return [];

    const dailyMap = new Map<
      string,
      { pv: number; show: number; upvote: number; comment: number; collect: number; share: number; title: string }
    >();
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
          pv: r.pv,
          show: r.show,
          upvote: r.upvote,
          comment: r.comment,
          collect: r.collect,
          share: r.share,
          title: r.title,
        });
      }
    }

    const incomeMap = new Map<string, number>();
    for (const r of records) {
      incomeMap.set(r.contentToken, (incomeMap.get(r.contentToken) ?? 0) + r.currentIncome);
    }

    const result: AggregatedContent[] = [];
    for (const [token, metrics] of dailyMap) {
      const income = incomeMap.get(token);
      if (income === undefined) continue;
      result.push({ contentToken: token, ...metrics, totalIncome: currency.convert(income) });
    }
    return result;
  }, [dailyData, records, currency]);

  const analysis = useMemo(() => {
    if (aggregated.length < 3) return null;

    const incomeValues = aggregated.map((a) => a.totalIncome);
    if (incomeValues.every((v) => v === 0)) return null;

    const xs = METRIC_INFO.map(({ key }) => aggregated.map((a) => a[key]));

    const correlations = METRIC_INFO.map(({ key, label, color }, i) => ({
      key,
      label,
      color,
      pearson: pearsonCorrelation(xs[i], incomeValues),
      spearman: spearmanCorrelation(xs[i], incomeValues),
    })).sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

    const regression = multipleLinearRegression(xs, incomeValues);
    const weights = METRIC_INFO.map(({ key, label, color }, i) => ({
      key,
      label,
      color,
      weight: regression.coefficients[i + 1],
    })).sort((a, b) => b.weight - a.weight);

    const contribBreakdown = contributionPercentages(regression.coefficients, xs);
    const contributions = METRIC_INFO.map(({ key, label, color }, i) => ({
      key,
      label,
      color,
      pct: contribBreakdown.featurePercentages[i],
    })).sort((a, b) => b.pct - a.pct);
    const baselinePct = contribBreakdown.baselinePercentage;
    const baselineAbs = contribBreakdown.absoluteContributions.baseline;
    const contribHasNegative = contribBreakdown.hasNegativeCoefficients;

    const elastic = elasticityAnalysis(xs, incomeValues);
    const elasticities = METRIC_INFO.map(({ key, label, color }, i) => ({
      key,
      label,
      color,
      elasticity: elastic.elasticities[i],
      r2: elastic.r2s[i],
    })).sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));

    const ridge = ridgeRegression(xs, incomeValues, 1.0);
    const ridgeWeights = METRIC_INFO.map(({ key, label, color }, i) => ({
      key,
      label,
      color,
      weight: ridge.coefficients[i + 1],
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    const interaction = interactionRegression(
      xs,
      incomeValues,
      METRIC_INFO.map((m) => m.label),
    );
    const topInteractions = interaction.terms.filter((t) => Math.abs(t.coeff) > 0.0001).slice(0, 6);

    const quantiles = quantileRegressionPredict(xs, incomeValues, [0.1, 0.5, 0.9]);
    const residuals = residualAnalysis(xs, incomeValues, ridge.coefficients);

    // Find the most impactful metric
    const topContrib = contributions[0];

    return {
      correlations,
      regression,
      weights,
      contributions,
      baselinePct,
      baselineAbs,
      contribHasNegative,
      elasticities,
      ridge,
      ridgeWeights,
      interaction,
      topInteractions,
      quantiles,
      residuals,
      contentCount: aggregated.length,
      topContrib,
    };
  }, [aggregated]);

  // Read + Interaction combined analysis (from income records, no daily data needed)
  const readInterAnalysis = useMemo(() => {
    const map = new Map<string, { read: number; interaction: number; income: number }>();
    for (const r of records) {
      const e = map.get(r.contentId);
      if (e) {
        e.read += r.currentRead;
        e.interaction += r.currentInteraction;
        e.income += r.currentIncome;
      } else map.set(r.contentId, { read: r.currentRead, interaction: r.currentInteraction, income: r.currentIncome });
    }
    const items = Array.from(map.values())
      .filter((i) => i.read > 0)
      .map((i) => ({
        ...i,
        income: currency.convert(i.income),
        engRate: (i.interaction / i.read) * 100,
        rpm: computeRPM(currency.convert(i.income), i.read),
      }));
    if (items.length < 4) return null;

    const reads = items.map((i) => i.read).sort((a, b) => a - b);
    const inters = items.map((i) => i.interaction).sort((a, b) => a - b);
    const medRead = reads[Math.floor(reads.length / 2)];
    const medInter = inters[Math.floor(inters.length / 2)];

    const groups = {
      hh: items.filter((i) => i.read >= medRead && i.interaction >= medInter),
      hl: items.filter((i) => i.read >= medRead && i.interaction < medInter),
      lh: items.filter((i) => i.read < medRead && i.interaction >= medInter),
      ll: items.filter((i) => i.read < medRead && i.interaction < medInter),
    };
    const avg = (arr: typeof items) => (arr.length ? arr.reduce((s, i) => s + i.income, 0) / arr.length : 0);
    const avgRpm = (arr: typeof items) => (arr.length ? arr.reduce((s, i) => s + i.rpm, 0) / arr.length : 0);

    const sorted = [...items].sort((a, b) => a.engRate - b.engRate);
    const third = Math.floor(sorted.length / 3);
    const tiers = { low: sorted.slice(0, third), mid: sorted.slice(third, third * 2), high: sorted.slice(third * 2) };
    const tierAvgEng = (arr: typeof items) => (arr.length ? arr.reduce((s, i) => s + i.engRate, 0) / arr.length : 0);

    return {
      quadrants: [
        { label: '阅读高+互动高', income: avg(groups.hh), rpm: avgRpm(groups.hh), count: groups.hh.length },
        { label: '阅读高+互动低', income: avg(groups.hl), rpm: avgRpm(groups.hl), count: groups.hl.length },
        { label: '阅读低+互动高', income: avg(groups.lh), rpm: avgRpm(groups.lh), count: groups.lh.length },
        { label: '阅读低+互动低', income: avg(groups.ll), rpm: avgRpm(groups.ll), count: groups.ll.length },
      ],
      tiers: [
        {
          label: '互动率低',
          engRate: tierAvgEng(tiers.low),
          income: avg(tiers.low),
          rpm: avgRpm(tiers.low),
          count: tiers.low.length,
        },
        {
          label: '互动率中',
          engRate: tierAvgEng(tiers.mid),
          income: avg(tiers.mid),
          rpm: avgRpm(tiers.mid),
          count: tiers.mid.length,
        },
        {
          label: '互动率高',
          engRate: tierAvgEng(tiers.high),
          income: avg(tiers.high),
          rpm: avgRpm(tiers.high),
          count: tiers.high.length,
        },
      ],
    };
  }, [records, currency]);

  // Inclusion delay: query ALL income records from DB + user settings for collect start date
  const [allIncomeRecords, setAllIncomeRecords] = useState<IncomeRecord[]>([]);
  const [collectStartDate, setCollectStartDate] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    db.incomeRecords.where('userId').equals(user.id).toArray().then(setAllIncomeRecords);
    db.userSettings.get(user.id).then((s) => setCollectStartDate(s?.collectStartDate ?? null));
  }, [user]);

  const inclusionDelay = useMemo(() => {
    if (allIncomeRecords.length === 0) return null;

    // Group by contentId: find publishDate and earliest recordDate with income > 0
    const map = new Map<string, { publishDate: string; firstRecordDate: string; title: string; contentType: string }>();
    for (const r of allIncomeRecords) {
      if (r.currentIncome <= 0) continue;
      const existing = map.get(r.contentId);
      if (existing) {
        if (r.recordDate < existing.firstRecordDate) existing.firstRecordDate = r.recordDate;
      } else {
        map.set(r.contentId, {
          publishDate: r.publishDate,
          firstRecordDate: r.recordDate,
          title: r.title,
          contentType: r.contentType,
        });
      }
    }

    // Only include content published AFTER collect start date
    // (older content's "first record" is just when we started collecting, not real first income)
    const items = Array.from(map.values())
      .filter((item) => !collectStartDate || item.publishDate >= collectStartDate)
      .map((item) => {
        const pub = new Date(item.publishDate);
        const first = new Date(item.firstRecordDate);
        const delayDays = Math.max(0, Math.round((first.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24)));
        return { ...item, delayDays };
      })
      .sort((a, b) => a.delayDays - b.delayDays);

    if (items.length === 0) return null;

    const delays = items.map((i) => i.delayDays);
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
    const sorted = [...delays].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const buckets = [
      { label: '当天', items: items.filter((i) => i.delayDays === 0) },
      { label: '1-3天', items: items.filter((i) => i.delayDays >= 1 && i.delayDays <= 3) },
      { label: '4-7天', items: items.filter((i) => i.delayDays >= 4 && i.delayDays <= 7) },
      { label: '8-14天', items: items.filter((i) => i.delayDays >= 8 && i.delayDays <= 14) },
      { label: '15天以上', items: items.filter((i) => i.delayDays >= 15) },
    ].filter((b) => b.items.length > 0);

    const slowest = items.slice(-3).reverse();

    return { avg, med, min, max, total: items.length, buckets, slowest };
  }, [allIncomeRecords, collectStartDate]);

  if (!analysis) {
    return (
      <div
        style={{
          background: '#fafafa',
          borderRadius: 8,
          padding: 20,
          textAlign: 'center',
          color: '#999',
          fontSize: 13,
        }}
      >
        跨内容分析需要至少 3 篇内容的每日详情数据，请在有收益内容明细表中批量拉取详情
      </div>
    );
  }

  const fitQuality = analysis.ridge.r2 > 0.7 ? '预测较准' : analysis.ridge.r2 > 0.4 ? '有参考价值' : '仅供参考';

  return (
    <div>
      <AntCard size="small" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#666' }}>
          综合分析了 <b>{analysis.contentCount}</b> 篇内容的数据。 模型{fitQuality}（准确度{' '}
          {(analysis.ridge.r2 * 100).toFixed(0)}%）。
          {analysis.topContrib && (
            <span>
              {' '}
              目前<b>{analysis.topContrib.label}</b>对收益贡献最大（{analysis.topContrib.pct.toFixed(0)}%）。
            </span>
          )}
        </div>
      </AntCard>

      <Row gutter={[16, 16]}>
        {/* What metrics correlate with income? */}
        <Col span={12}>
          <Card title="哪些指标和收益关系最大？" subtitle="柱子越长 = 关系越紧密，靠右 = 正向关系">
            {analysis.correlations.map(({ key, label, color, pearson }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
                <CorrelationBar value={pearson} color={color} />
                <div style={{ width: 80, fontSize: 11, textAlign: 'right', color: '#666' }}>
                  {describeCorr(pearson)}
                </div>
              </div>
            ))}
          </Card>
        </Col>

        {/* What drives income? */}
        <Col span={12}>
          <Card title="收益主要靠什么？" subtitle="各指标对收益的贡献比例">
            {analysis.contributions.map(({ key, label, color, pct }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
                <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 8 }}
                  />
                </div>
                <div
                  style={{
                    width: 45,
                    fontSize: 12,
                    textAlign: 'right',
                    fontWeight: 600,
                    color: pct > 10 ? '#333' : '#999',
                  }}
                >
                  {pct.toFixed(1)}%
                </div>
              </div>
            ))}
            {/* Baseline (intercept) row — always visible even when small */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div style={{ width: 50, fontSize: 12, color: '#999' }}>基础</div>
              <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(Math.abs(analysis.baselinePct), 100)}%`,
                    height: '100%',
                    background: analysis.baselinePct < 0 ? '#d97706' : '#bbb',
                    borderRadius: 8,
                  }}
                />
              </div>
              <div
                style={{
                  width: 45,
                  fontSize: 12,
                  textAlign: 'right',
                  fontWeight: 600,
                  color: analysis.baselinePct < 0 ? themeColors.amber : '#666',
                }}
              >
                {analysis.baselinePct.toFixed(1)}%
              </div>
            </div>
            <div style={{ marginLeft: 56, marginBottom: 4, fontSize: 11, color: '#999' }}>
              （基础值 ≈ {currency.fmtValue(analysis.baselineAbs)}）
            </div>
            {analysis.contribHasNegative && (
              <div style={{ marginTop: 8, fontSize: 11, color: themeColors.amber }}>
                ⚠️ 检测到负系数（通常来自 ridge 回归），贡献度含义被部分抵消；请结合绝对分解阅读。
              </div>
            )}
          </Card>
        </Col>

        {/* How much is each metric worth? */}
        <Col span={12}>
          <Card title="每个指标值多少钱？" subtitle="每增加1个阅读/点赞/评论等，收益增加多少">
            {analysis.ridgeWeights.map(({ key, label, color, weight }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      background: weight > 0 ? `${color}20` : weight < 0 ? '#ffebee' : '#f5f5f5',
                      color: weight > 0 ? color : weight < 0 ? themeColors.warmRed : '#999',
                    }}
                  >
                    {Math.abs(weight) < 0.0001
                      ? '影响极小'
                      : `${weight > 0 ? '+' : ''}${currency.prefix}${weight.toFixed(4)}${currency.suffix}`}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
              例：+{currency.prefix}0.0050{currency.suffix} 表示每多1个该指标，收益多
              {currency.unit === 'yuan' ? '0.5分钱' : '0.005盐粒'}
            </div>
          </Card>
        </Col>

        {/* Which metrics to invest in? */}
        <Col span={12}>
          <Card title="提升哪个指标最划算？" subtitle="该指标增长10%时，收益大约增长多少">
            {analysis.elasticities.map(({ key, label, color, elasticity }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 50, fontSize: 12, color: '#666' }}>{label}</div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      background: `${color}15`,
                      color,
                      fontWeight: Math.abs(elasticity) > 0.5 ? 600 : 400,
                    }}
                  >
                    {elasticity > 0 ? '+' : ''}
                    {(elasticity * 10).toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>{describeElasticity(elasticity)}</div>
              </div>
            ))}
          </Card>
        </Col>

        {/* Which combos work? */}
        <Col span={12}>
          <Card title="哪些指标组合更赚钱？" subtitle="同时提升这两个指标时，是否有额外加成">
            {analysis.topInteractions.length === 0 ? (
              <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 10 }}>
                未发现明显的指标组合效应
              </div>
            ) : (
              analysis.topInteractions.map(({ name, coeff }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#666', flex: 1 }}>{name}</div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      background: coeff > 0 ? '#e8f5e9' : '#ffebee',
                      color: coeff > 0 ? '#2e7d32' : '#c62828',
                    }}
                  >
                    {coeff > 0 ? '有额外加成' : '互相削弱'}
                  </span>
                </div>
              ))
            )}
          </Card>
        </Col>

        {/* Best/worst case income */}
        <Col span={12}>
          <Card title="收益的最好和最差情况" subtitle="每增加1单位指标时，乐观和悲观的收益变化">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#999', fontSize: 11 }}>指标</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: themeColors.warmRed, fontSize: 11 }}>
                      最差
                    </th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: '#333', fontSize: 11 }}>一般</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: '#2e7d32', fontSize: 11 }}>最好</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_INFO.map(({ key, label }, mi) => {
                    const q10 = analysis.quantiles[0].coefficients[mi + 1];
                    const q50 = analysis.quantiles[1].coefficients[mi + 1];
                    const q90 = analysis.quantiles[2].coefficients[mi + 1];
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '5px 6px', color: '#666' }}>{label}</td>
                        <td style={{ textAlign: 'right', padding: '5px 6px', color: themeColors.warmRed }}>
                          {Math.abs(q10) < 0.0001 ? '-' : `${currency.prefix}${q10.toFixed(4)}${currency.suffix}`}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 600 }}>
                          {Math.abs(q50) < 0.0001 ? '-' : `${currency.prefix}${q50.toFixed(4)}${currency.suffix}`}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 6px', color: '#2e7d32' }}>
                          {Math.abs(q90) < 0.0001 ? '-' : `${currency.prefix}${q90.toFixed(4)}${currency.suffix}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 6 }}>
              "最差"指运气不好时的收益，"最好"指运气好时的收益
            </div>
          </Card>
        </Col>

        {/* Surprising content */}
        <Col span={12}>
          <Card title="哪些内容的收益出乎意料？" subtitle={`模型预测平均偏差 ${analysis.residuals.mape.toFixed(0)}%`}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
              以下内容的实际收益与根据指标预测的收益差距最大：
            </div>
            {aggregated
              .map((a, i) => ({
                title: a.title,
                actual: a.totalIncome,
                predicted: analysis.residuals.predicted[i],
                residual: analysis.residuals.residuals[i],
              }))
              .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
              .slice(0, 5)
              .map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    marginBottom: 6,
                    background: item.residual > 0 ? '#e8f5e9' : '#ffebee',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      marginBottom: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
                    <span>
                      预期 {currency.fmtValue(item.predicted)} | 实际 {currency.fmtValue(item.actual)}
                    </span>
                    <span style={{ fontWeight: 600, color: item.residual > 0 ? '#2e7d32' : '#c62828' }}>
                      {item.residual > 0 ? '超出预期' : '低于预期'} {currency.fmtValue(Math.abs(item.residual))}
                    </span>
                  </div>
                </div>
              ))}
          </Card>
        </Col>

        {/* Read + Interaction quadrant */}
        {readInterAnalysis && (
          <Col span={12}>
            <Card title="阅读+互动如何影响收益？" subtitle="按阅读量和互动量分成4组对比">
              {readInterAnalysis.quadrants.map((q, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 90, fontSize: 12, color: '#666' }}>{q.label}</div>
                  <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min((q.income / Math.max(...readInterAnalysis.quadrants.map((x) => x.income), 1)) * 100, 100)}%`,
                        height: '100%',
                        borderRadius: 8,
                        background: [themeColors.warmBlue, '#8badc4', themeColors.amberLight, themeColors.border][i],
                      }}
                    />
                  </div>
                  <div style={{ width: 65, fontSize: 12, textAlign: 'right', fontWeight: 600 }}>
                    {currency.fmtValue(q.income)}
                  </div>
                  <div style={{ width: 30, fontSize: 10, color: '#999', textAlign: 'right' }}>{q.count}篇</div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>以中位数为界分组，显示每组的平均收益</div>
            </Card>
          </Col>
        )}

        {/* Engagement rate tiers */}
        {readInterAnalysis && (
          <Col span={12}>
            <Card title="互动率高是不是更赚钱？" subtitle="按互动率（互动÷阅读）分成三组对比">
              {readInterAnalysis.tiers.map((t, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#666' }}>
                      {t.label}（{t.engRate.toFixed(1)}%）· {t.count}篇
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>平均收益</div>
                      <div style={{ height: 20, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min((t.income / Math.max(...readInterAnalysis.tiers.map((x) => x.income), 1)) * 100, 100)}%`,
                            height: '100%',
                            borderRadius: 4,
                            background: [themeColors.border, '#8badc4', themeColors.warmBlue][i],
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{currency.fmtValue(t.income)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>千次阅读收益</div>
                      <div style={{ height: 20, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min((t.rpm / Math.max(...readInterAnalysis.tiers.map((x) => x.rpm), 1)) * 100, 100)}%`,
                            height: '100%',
                            borderRadius: 4,
                            background: ['#f0d5d1', '#d9a09a', themeColors.warmRed][i],
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        {currency.rpmPfx}
                        {t.rpm.toFixed(2)}
                        {currency.rpmSfx}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          </Col>
        )}
        {/* Inclusion delay */}
        {inclusionDelay && (
          <Col span={12}>
            <Card title="发布多久后开始有收益？" subtitle={`统计了采集期内发布的 ${inclusionDelay.total} 篇内容`}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div
                  style={{ flex: 1, background: '#f0f7ff', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}
                >
                  <div style={{ fontSize: 10, color: '#666' }}>平均延迟</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: themeColors.warmBlue }}>
                    {inclusionDelay.avg.toFixed(1)}天
                  </div>
                </div>
                <div
                  style={{ flex: 1, background: '#f5f5f5', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}
                >
                  <div style={{ fontSize: 10, color: '#666' }}>中位数</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{inclusionDelay.med}天</div>
                </div>
                <div
                  style={{ flex: 1, background: '#f5f5f5', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}
                >
                  <div style={{ fontSize: 10, color: '#666' }}>最快 / 最慢</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>
                    {inclusionDelay.min}天 / {inclusionDelay.max}天
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, color: '#333' }}>延迟分布</div>
              {inclusionDelay.buckets.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 60, fontSize: 12, color: '#666' }}>{b.label}</div>
                  <div style={{ flex: 1, height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(b.items.length / inclusionDelay.total) * 100}%`,
                        height: '100%',
                        borderRadius: 8,
                        background:
                          i === 0
                            ? themeColors.sage
                            : i <= 1
                              ? themeColors.warmBlue
                              : i <= 2
                                ? themeColors.amberLight
                                : themeColors.warmRed,
                      }}
                    />
                  </div>
                  <div style={{ width: 55, fontSize: 12, textAlign: 'right', color: '#666' }}>
                    {b.items.length}篇 ({((b.items.length / inclusionDelay.total) * 100).toFixed(0)}%)
                  </div>
                </div>
              ))}
              {inclusionDelay.slowest.length > 0 && inclusionDelay.max > 7 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>收录最慢的内容：</div>
                  {inclusionDelay.slowest.slice(0, 3).map((item, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        color: '#666',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}
                    >
                      {item.delayDays}天 — {item.title}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        )}
      </Row>

      <FormulaBlock
        title="本区域使用的计算方法"
        items={[
          {
            name: '相关性分析（Pearson 相关系数）',
            formula: 'r = Σ(x-x̄)(y-ȳ) ÷ √[Σ(x-x̄)² × Σ(y-ȳ)²]\n范围：-1 到 +1',
            desc: '衡量两个指标之间的线性关系强度。+1表示完全正相关（一个涨另一个也涨），-1表示完全负相关，0表示没关系。我们用每篇内容的指标总值和总收益来计算。',
          },
          {
            name: '贡献占比',
            formula: '贡献_i = 权重_i × 指标_i的均值\n占比_i = 贡献_i ÷ Σ所有贡献 × 100%',
            desc: '先用回归算出每个指标的权重，再乘以该指标的平均值，得到"该指标对收益的绝对贡献"，最后归一化为百分比。',
          },
          {
            name: '每个指标值多少钱（岭回归 Ridge）',
            formula: "收益 = b₀ + b₁×阅读 + b₂×点赞 + b₃×评论 + ...\n求解：β = (X'X + λI)⁻¹X'y  (λ=1.0)",
            desc: '找一条最佳拟合线，使得"由指标预测的收益"和"实际收益"的误差最小。加入λ惩罚项（岭回归）是为了避免阅读量和曝光量这种高度相关的指标互相干扰，让结果更稳定。b₁就是每多一次阅读增加的收益。',
          },
          {
            name: '提升哪个指标最划算（弹性分析）',
            formula: 'ln(收益) = a + b × ln(指标)\n弹性 = b（即指标变1%，收益变b%）',
            desc: '对收益和指标同时取对数再做回归。得到的斜率b就是弹性：指标每增长1%，收益增长b%。这比直接看金额更公平，因为消除了量级差异（点赞100和阅读10000不在同一量级）。',
          },
          {
            name: '指标组合效应（交互项回归）',
            formula: '收益 = ... + b_ij × 指标_i × 指标_j + ...\nb_ij > 0 表示协同加成',
            desc: '在回归中加入两个指标的乘积项。如果系数为正，说明这两个指标同时高的内容，收益比单独高某一个指标要多（1+1>2的效果）。',
          },
          {
            name: '最好/最差情况（分位数回归）',
            formula:
              '最差(P10): 最小化 Σ 0.1×|正残差| + 0.9×|负残差|\n一般(P50): 最小化 Σ 0.5×|残差| (中位数回归)\n最好(P90): 最小化 Σ 0.9×|正残差| + 0.1×|负残差|',
            desc: '普通回归预测的是平均值，但实际收益有波动。分位数回归分别预测"运气差时(P10)"、"一般情况(P50)"、"运气好时(P90)"的收益。P10到P90的范围就是你大概率会落入的收益区间。',
          },
          {
            name: '出乎意料的内容（残差分析）',
            formula: '残差 = 实际收益 - 预测收益\nMAPE = Σ|残差/实际值| ÷ n × 100%',
            desc: '残差就是模型预测不了的部分。残差大的内容说明有我们没捕捉到的因素在影响收益（比如知乎的推荐算法加权、内容垂直度等）。MAPE是平均预测误差的百分比。',
          },
          {
            name: '阅读+互动分组',
            formula: '阅读量中位数 = 排序后取中间值\n高于中位数 = "高"，低于 = "低"\n分成4组后求各组平均收益',
            desc: '中位数不受极端值影响（一篇爆款不会拉高标准）。4组对比可以看出：阅读量和互动量哪个对收益影响更大，以及两者是否有协同效应。',
          },
          {
            name: '互动率分组',
            formula: '互动率 = 互动次数 ÷ 阅读次数 × 100%\n按互动率排序后均分三组\n千次阅读收益 = 收益 ÷ 阅读量 × 1000',
            desc: '千次阅读收益排除了阅读量差异，如果互动率高的组千次阅读收益也高，说明互动对收益有独立的加成作用，不只是因为阅读多。',
          },
          {
            name: '收录延迟',
            formula: '延迟天数 = 首次产生收益的日期 - 内容发布日期\n只统计：收益 > 0 且发布日期 ≥ 采集起始日期',
            desc: '只统计采集期内发布的内容，因为更早发布的内容我们没有完整的收益记录，无法确定真正的首次收益日期。"当天"表示发布当天就有收益（上午发布，当天就有阅读和收入）。',
          },
        ]}
      />
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
        * 预估结果仅供参考，不代表实际收益
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <AntCard
      size="small"
      title={title}
      extra={subtitle ? <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>{subtitle}</span> : undefined}
    >
      {children}
    </AntCard>
  );
}

function CorrelationBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 14, background: '#eee', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: value >= 0 ? '50%' : `${50 + value * 50}%`,
          width: `${Math.abs(value) * 50}%`,
          height: '100%',
          background: value >= 0 ? color : themeColors.warmRed,
          borderRadius: 7,
        }}
      />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />
    </div>
  );
}
