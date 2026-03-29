import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Button, Tag, Flex, Alert, Steps, Progress, Space, Tabs } from 'antd';
import { ReloadOutlined, ExperimentOutlined, LoadingOutlined, CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getAllRealtimeAggr } from '@/db/realtime-store';
import { getAllDailySummaries } from '@/db/income-store';
import { db } from '@/db/database';
import type { RealtimeAggrRecord, DailySummary } from '@/shared/types';
import {
  buildRealtimeTrainingRows,
  buildTodayFeatures,
  trainRealtimeModel,
  predictWithRealtimeModel,
  REALTIME_FEATURE_LABELS,
  type RealtimeModelResult,
  type SavedRealtimeModel,
} from '@/shared/ml-realtime';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';

const MODEL_DB_KEY = 'realtimeModel';

export function TodayPredictionPanel() {
  const { user } = useCurrentUser();
  const [aggrRecords, setAggrRecords] = useState<RealtimeAggrRecord[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [modelResult, setModelResult] = useState<RealtimeModelResult | null>(null);
  const [savedModel, setSavedModel] = useState<SavedRealtimeModel | null>(null);

  const [todayData, setTodayData] = useState<RealtimeAggrRecord | null>(null);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [todayUpdatedAt, setTodayUpdatedAt] = useState('');

  const [syncing, setSyncing] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState<{ step: number; total: number; label: string } | null>(null);
  const [fetchingToday, setFetchingToday] = useState(false);
  const [error, setError] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;
    const [aggr, sums] = await Promise.all([
      getAllRealtimeAggr(user.id),
      getAllDailySummaries(user.id),
    ]);
    setAggrRecords(aggr);
    setSummaries(sums);

    // Load saved model
    const saved = await db.mlModels.get(`${user.id}_realtime`);
    if (saved) {
      try {
        const evaluation = JSON.parse(saved.evaluationResult) as RealtimeModelResult;
        setModelResult(evaluation);
        setSavedModel({
          rfJson: saved.rfJson,
          ridgeCoefficients: saved.ridgeCoefficients,
          rfWeight: saved.ensembleWeights[0],
          ridgeWeight: saved.ensembleWeights[1],
          evaluation: saved.evaluationResult,
        });
      } catch { /* ignore */ }
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sync historical realtime data
  const handleSyncHistory = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const resp = await new Promise<{ ok: boolean; count?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'syncRealtimeAggr' }, (r) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(r);
        });
      });
      if (resp.ok) {
        await loadData();
      } else {
        setError(resp.error ?? '同步失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  // Train model
  const handleTrain = useCallback(async () => {
    if (!user) return;
    setTraining(true);
    setTrainingStep(null);
    setError('');
    try {
      const rows = buildRealtimeTrainingRows(aggrRecords, summaries);
      const output = trainRealtimeModel(rows, setTrainingStep);
      if (!output) {
        setError('数据不足，至少需要 10 天的历史汇总数据和对应收益数据');
        return;
      }
      setModelResult(output.result);
      setSavedModel(output.savedModel);

      // Persist to DB
      await db.mlModels.put({
        userId: `${user.id}_realtime`,
        trainedAt: Date.now(),
        dataCount: rows.length,
        rfJson: output.savedModel.rfJson,
        ridgeCoefficients: output.savedModel.ridgeCoefficients,
        scaler: { means: [], stds: [] },
        labelScaler: { mean: 0, std: 1 },
        ensembleWeights: [output.savedModel.rfWeight, output.savedModel.ridgeWeight],
        evaluationResult: output.savedModel.evaluation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '训练失败');
    } finally {
      setTraining(false);
      setTrainingStep(null);
    }
  }, [user, aggrRecords, summaries]);

  // Fetch today's data and predict
  const handleFetchToday = useCallback(async () => {
    if (!savedModel) return;
    setFetchingToday(true);
    setError('');
    try {
      const resp = await new Promise<{ ok: boolean; today?: any; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchTodayRealtime' }, (r) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(r);
        });
      });

      if (!resp.ok || !resp.today) {
        setError('获取今日数据失败');
        return;
      }

      const todayRecord: RealtimeAggrRecord = {
        userId: user!.id,
        date: resp.today.date,
        updatedAt: resp.today.updatedAt ?? '',
        pv: resp.today.pv ?? 0,
        play: resp.today.play ?? 0,
        show: resp.today.show ?? 0,
        upvote: resp.today.upvote ?? 0,
        comment: resp.today.comment ?? 0,
        like: resp.today.like ?? 0,
        collect: resp.today.collect ?? 0,
        share: resp.today.share ?? 0,
        reaction: resp.today.reaction ?? 0,
        rePin: resp.today.rePin ?? 0,
        likeAndReaction: resp.today.likeAndReaction ?? 0,
        newUpvote: resp.today.newUpvote ?? 0,
        newLike: resp.today.newLike ?? 0,
        newIncrUpvoteNum: resp.today.newIncrUpvoteNum ?? 0,
        newDescUpvoteNum: resp.today.newDescUpvoteNum ?? 0,
        newIncrLikeNum: resp.today.newIncrLikeNum ?? 0,
        newDescLikeNum: resp.today.newDescLikeNum ?? 0,
        collectedAt: Date.now(),
      };
      setTodayData(todayRecord);
      setTodayUpdatedAt(resp.today.updatedAt ?? '');

      // Get yesterday's income for feature
      const incomeMap = new Map(summaries.map(s => [s.date, s.totalIncome / 100]));
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      const yesterdayIncome = incomeMap.get(yStr) ?? 0;

      const features = buildTodayFeatures(todayRecord, yesterdayIncome);
      const pred = predictWithRealtimeModel(savedModel, features);
      setPrediction(pred);
    } catch (err) {
      setError(err instanceof Error ? err.message : '预测失败');
    } finally {
      setFetchingToday(false);
    }
  }, [user, savedModel, summaries]);

  const trainingRows = buildRealtimeTrainingRows(aggrRecords, summaries);
  const hasEnoughData = trainingRows.length >= 10;

  // ── No data synced yet ──
  if (aggrRecords.length === 0) {
    return (
      <Card title={<><ThunderboltOutlined /> 今日收益预测</>} size="small">
        <Flex vertical align="center" gap={12} style={{ padding: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>需要先同步历史汇总数据</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              从知乎拉取每天的阅读、点赞等汇总数据，用来训练预测模型
            </div>
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleSyncHistory} loading={syncing}>
              同步历史汇总数据
            </Button>
          </div>
          {error && <Alert type="error" message={error} showIcon style={{ width: '100%' }} />}
        </Flex>
      </Card>
    );
  }

  // ── Training in progress ──
  if (training) {
    const percent = trainingStep ? Math.round((trainingStep.step / trainingStep.total) * 100) : 0;
    return (
      <Card title={<><ThunderboltOutlined /> 正在训练预测模型...</>} size="small">
        <Progress percent={percent} status="active" strokeColor={themeColors.warmBlue} style={{ marginBottom: 16 }} />
        <Steps
          current={trainingStep ? trainingStep.step - 1 : 0}
          size="small"
          items={[
            { title: '准备数据' },
            { title: '随机森林' },
            { title: '岭回归' },
            { title: '集成计算' },
          ].map((item, i) => ({
            ...item,
            status: trainingStep
              ? i < trainingStep.step - 1 ? 'finish' : i === trainingStep.step - 1 ? 'process' : 'wait'
              : 'wait',
            icon: trainingStep && i === trainingStep.step - 1 ? <LoadingOutlined /> : undefined,
          }))}
        />
      </Card>
    );
  }

  // ── Model not trained yet ──
  if (!modelResult) {
    return (
      <Card title={<><ThunderboltOutlined /> 今日收益预测</>} size="small">
        <Flex vertical align="center" gap={12} style={{ padding: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>训练预测模型</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
              已同步 {aggrRecords.length} 天汇总数据，可匹配 {trainingRows.length} 天训练数据
            </div>
            {!hasEnoughData && (
              <Alert
                type="warning" showIcon
                message={`需要至少 10 天数据（当前 ${trainingRows.length} 天），请确保已同步收益数据`}
                style={{ marginBottom: 12, textAlign: 'left' }}
              />
            )}
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleSyncHistory} loading={syncing}>
                补充汇总数据
              </Button>
              <Button type="primary" icon={<ExperimentOutlined />} onClick={handleTrain} disabled={!hasEnoughData}>
                开始训练
              </Button>
            </Space>
          </div>
          {error && <Alert type="error" message={error} showIcon style={{ width: '100%', marginTop: 8 }} />}
        </Flex>
      </Card>
    );
  }

  // ── Model trained, show results + prediction ──
  const accuracy = modelResult.r2 >= 0.9 ? { text: '非常准', color: themeColors.sage }
    : modelResult.r2 >= 0.7 ? { text: '比较准', color: themeColors.warmBlue }
    : modelResult.r2 >= 0.5 ? { text: '一般', color: themeColors.amber }
    : { text: '不太准', color: themeColors.warmRed };

  const importanceData = (modelResult.featureImportance ?? []).slice(0, 8);

  const chartDates = (modelResult.testDates ?? []).map(d => d.slice(5));
  const verifyChartOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const lines = params.map((p: any) => `${p.marker} ${p.seriesName}: ¥${p.value.toFixed(2)}`);
        return `${params[0].name}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['实际收益', '模型预测'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    xAxis: { type: 'category' as const, data: chartDates, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` } },
    series: [
      {
        name: '实际收益',
        type: 'bar',
        data: modelResult.testActual,
        itemStyle: { color: 'rgba(91, 122, 157, 0.25)', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: '模型预测',
        type: 'line',
        data: modelResult.ensemblePredictions,
        itemStyle: { color: themeColors.warmRed },
        lineStyle: { width: 2 },
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
      },
    ],
    ...timeSeriesZoom,
  };

  const importanceOption = importanceData.length > 0 ? {
    tooltip: { formatter: (p: any) => `${p.name}: 影响力 ${p.value.toFixed(1)}%` },
    grid: { left: 90, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value' as const, show: false },
    yAxis: {
      type: 'category' as const,
      data: importanceData.map(i => REALTIME_FEATURE_LABELS[i.name] ?? i.name).reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: importanceData.map(i => i.importance).reverse(),
      barMaxWidth: 14,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (params: any) => {
          const colors = [themeColors.warmBlue, themeColors.sage, themeColors.warmRed, themeColors.amberLight, '#8b7bb5', '#5a9e8f', themeColors.amberLight, themeColors.muted];
          return colors[params.dataIndex % colors.length];
        },
      },
      label: { show: true, position: 'right' as const, fontSize: 10, formatter: (p: any) => `${p.value.toFixed(1)}%` },
    }],
  } : null;

  return (
    <Flex vertical gap={16}>
      {/* Today's prediction */}
      <Card
        title={<><ThunderboltOutlined /> 今日收益预测</>}
        size="small"
        extra={
          <Space>
            {todayUpdatedAt && (
              <span style={{ fontSize: 11, color: '#999' }}>
                <ClockCircleOutlined /> 数据更新于 {todayUpdatedAt}
              </span>
            )}
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleFetchToday}
              loading={fetchingToday}
            >
              {prediction !== null ? '刷新预测' : '获取今日数据并预测'}
            </Button>
          </Space>
        }
      >
        {prediction !== null && todayData ? (
          <Row gutter={16}>
            <Col span={8}>
              <div style={{
                textAlign: 'center', padding: '20px 0',
                background: 'linear-gradient(135deg, #f0f7ff, #e8f5e9)',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>预测今日总收益</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: themeColors.warmBlue }}>
                  ¥{prediction.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  基于当前实时数据推算
                </div>
              </div>
            </Col>
            <Col span={16}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>当前实时数据</div>
              <Row gutter={[8, 8]}>
                {[
                  { label: '阅读', value: todayData.pv.toLocaleString(), color: themeColors.warmBlue },
                  { label: '曝光', value: todayData.show.toLocaleString(), color: '#999' },
                  { label: '点赞', value: todayData.upvote.toLocaleString(), color: themeColors.warmRed },
                  { label: '评论', value: todayData.comment.toLocaleString(), color: themeColors.sage },
                  { label: '收藏', value: todayData.collect.toLocaleString(), color: themeColors.amberLight },
                  { label: '分享', value: todayData.share.toLocaleString(), color: '#8b7bb5' },
                  { label: '新增赞', value: `+${todayData.newIncrUpvoteNum}`, color: themeColors.sage },
                  { label: '取消赞', value: `-${todayData.newDescUpvoteNum}`, color: themeColors.warmRed },
                ].map(item => (
                  <Col span={6} key={item.label}>
                    <div style={{ background: '#fafafa', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#999' }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        ) : (
          <Flex justify="center" style={{ padding: 20, color: '#999' }}>
            点击右上角按钮获取今日实时数据并预测收益
          </Flex>
        )}
        {error && <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />}
      </Card>

      {/* Model accuracy + charts */}
      <Card size="small">
        <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
          <Flex align="center" gap={12}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              background: `${accuracy.color}15`, border: `2px solid ${accuracy.color}`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: accuracy.color, lineHeight: 1 }}>
                {(modelResult.r2 * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: 8, color: accuracy.color }}>准确度</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                预测模型 <Tag color={accuracy.color}>{accuracy.text}</Tag>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>
                {modelResult.dataCount} 天数据 · 平均偏差 ¥{modelResult.mae.toFixed(2)}
              </div>
            </div>
          </Flex>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={handleSyncHistory} loading={syncing}>
              补充数据
            </Button>
            <Button size="small" icon={<ExperimentOutlined />} onClick={handleTrain}>
              重新训练
            </Button>
          </Space>
        </Flex>

        <Row gutter={16}>
          <Col span={importanceOption ? 14 : 24}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>预测效果验证（历史数据）</div>
            <ReactECharts option={verifyChartOption} style={{ height: 220 }} />
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>
              蓝色柱子 = 实际收益 | 红色线 = 模型预测
            </div>
          </Col>
          {importanceOption && (
            <Col span={10}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>哪些指标最影响收益？</div>
              <ReactECharts option={importanceOption} style={{ height: 220 }} />
            </Col>
          )}
        </Row>
      </Card>

      {/* Historical daily data */}
      {aggrRecords.length > 0 && (
        <HistoryDataSection aggrRecords={aggrRecords} summaries={summaries} />
      )}

      <FormulaBlock title="今日预测原理" items={[
        { name: '数据来源', formula: '知乎创作者实时 API\n每次获取当天最新的阅读、点赞等汇总数据', desc: '数据是实时更新的，随着今天的阅读量增长，预测结果也会不断变化。建议下午/晚上预测会更准（数据更完整）。' },
        { name: '训练数据', formula: '每天的汇总指标（阅读、点赞、评论...）→ 当天总收益\n历史 N 天数据 = N 条训练样本', desc: '模型学的是「一天的整体表现 → 当天能赚多少钱」的关系。和 ML 预测标签页的单篇预测不同，这里是全部内容的汇总预测。' },
        { name: '特征工程', formula: '原始指标: 阅读、曝光、点赞、评论、收藏、分享...\n衍生指标: 点击率=阅读/曝光, 互动率, 赞同流失率\n时间特征: 星期几\n历史: 昨日收益', desc: '赞同流失率（取消赞同/新增赞同）是一个有趣的特征——如果很多人取消赞同，可能说明内容争议性大，这会影响推荐和收益。' },
      ]} />
    </Flex>
  );
}

// ── Historical data visualization ──

const METRIC_GROUPS = [
  {
    key: 'traffic',
    label: '流量',
    metrics: [
      { key: 'pv', label: '阅读量', color: themeColors.warmBlue },
      { key: 'show', label: '曝光量', color: '#999' },
    ],
  },
  {
    key: 'engagement',
    label: '互动',
    metrics: [
      { key: 'upvote', label: '点赞', color: themeColors.warmRed },
      { key: 'comment', label: '评论', color: themeColors.sage },
      { key: 'collect', label: '收藏', color: themeColors.amberLight },
      { key: 'share', label: '分享', color: '#8b7bb5' },
    ],
  },
  {
    key: 'upvoteDetail',
    label: '赞同明细',
    metrics: [
      { key: 'newIncrUpvoteNum', label: '新增赞同', color: themeColors.sage },
      { key: 'newDescUpvoteNum', label: '取消赞同', color: themeColors.warmRed },
      { key: 'upvote', label: '净赞同', color: themeColors.warmBlue },
    ],
  },
  {
    key: 'other',
    label: '其他',
    metrics: [
      { key: 'like', label: '喜欢', color: '#e91e63' },
      { key: 'play', label: '播放', color: '#5a9e8f' },
      { key: 'rePin', label: '转发', color: themeColors.amberLight },
    ],
  },
];

function HistoryDataSection({ aggrRecords, summaries }: {
  aggrRecords: RealtimeAggrRecord[];
  summaries: DailySummary[];
}) {
  const sorted = useMemo(
    () => [...aggrRecords].sort((a, b) => a.date.localeCompare(b.date)),
    [aggrRecords],
  );
  const incomeMap = useMemo(
    () => new Map(summaries.map(s => [s.date, s.totalIncome / 100])),
    [summaries],
  );
  const dates = sorted.map(r => r.date.slice(5));
  const incomeData = sorted.map(r => incomeMap.get(r.date) ?? null);

  const buildChartOption = (metrics: { key: string; label: string; color: string }[]) => ({
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: [...metrics.map(m => m.label), '收益'],
      textStyle: { fontSize: 11 },
      right: 0,
      top: 0,
    },
    grid: withZoomGrid({ left: 50, right: 50, top: 30, bottom: 25 }),
    xAxis: {
      type: 'category' as const,
      data: dates,
      axisLabel: { fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: [
      { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3, position: 'left' as const },
      { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v}` }, splitNumber: 3, position: 'right' as const },
    ],
    series: [
      ...metrics.map(m => ({
        name: m.label,
        type: 'line' as const,
        data: sorted.map(r => (r as any)[m.key] ?? 0),
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: m.color },
        lineStyle: { width: 2 },
        symbol: 'none',
      })),
      {
        name: '收益',
        type: 'bar' as const,
        data: incomeData,
        yAxisIndex: 1,
        itemStyle: { color: 'rgba(91, 122, 157, 0.15)', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 10,
      },
    ],
    ...timeSeriesZoom,
  });

  // Overview chart: pv + income + engagement rate
  const overviewOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const lines = params.map((p: any) => {
          if (p.seriesName === '收益') return `${p.marker} ${p.seriesName}: ¥${(p.value ?? 0).toFixed(2)}`;
          if (p.seriesName === '互动率') return `${p.marker} ${p.seriesName}: ${((p.value ?? 0) * 100).toFixed(2)}%`;
          return `${p.marker} ${p.seriesName}: ${(p.value ?? 0).toLocaleString()}`;
        });
        return `${params[0].name}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['阅读量', '收益', '互动率'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 50, top: 30, bottom: 25 }),
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3 },
      { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v}` }, splitNumber: 3, position: 'right' as const },
    ],
    series: [
      {
        name: '阅读量',
        type: 'bar' as const,
        data: sorted.map(r => r.pv),
        yAxisIndex: 0,
        itemStyle: { color: 'rgba(91, 122, 157, 0.3)', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
      {
        name: '收益',
        type: 'line' as const,
        data: incomeData,
        yAxisIndex: 1,
        itemStyle: { color: themeColors.warmRed },
        lineStyle: { width: 2 },
        smooth: true,
        symbol: 'none',
      },
      {
        name: '互动率',
        type: 'line' as const,
        data: sorted.map(r => r.pv > 0 ? (r.upvote + r.comment + r.collect + r.share) / r.pv : 0),
        yAxisIndex: 0,
        itemStyle: { color: themeColors.sage },
        lineStyle: { width: 1.5, type: 'dashed' as const },
        smooth: true,
        symbol: 'none',
      },
    ],
    ...timeSeriesZoom,
  };

  return (
    <Card title={`每日汇总数据（${sorted.length} 天）`} size="small">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>总览：阅读量 vs 收益 vs 互动率</div>
        <ReactECharts option={overviewOption} style={{ height: 250 }} />
      </div>
      <Tabs
        size="small"
        items={METRIC_GROUPS.map(group => ({
          key: group.key,
          label: group.label,
          children: (
            <ReactECharts option={buildChartOption(group.metrics)} style={{ height: 220 }} />
          ),
        }))}
      />
    </Card>
  );
}
