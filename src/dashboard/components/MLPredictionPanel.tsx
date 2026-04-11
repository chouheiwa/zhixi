import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Button, Tag, Progress, Flex, Empty, Alert, Space, Steps, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ExperimentOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { IncomeRecord, ContentDailyRecord } from '@/shared/types';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import { buildFeatureRows, buildPredictionFeatures, FEATURE_NAMES } from '@/shared/ml-features';
import {
  trainEnsemble,
  loadSavedModel,
  predictWithSavedModel,
  type EnsembleResult,
  type TrainingStep,
} from '@/shared/ml-models';
import { FormulaBlock } from './FormulaHelp';
import { contentTypeShortLabel, contentTypeColor } from '@/shared/content-type';
import { themeColors } from '../theme';

interface Props {
  records: IncomeRecord[];
  demoMode?: boolean;
  demoStep?: number;
  onDemoAnimating?: (animating: boolean) => void;
}

interface LossTooltipParam {
  seriesName: string;
  value: number;
}

interface PredictionChartParam {
  name: string;
  marker: string;
  seriesName: string;
  value: number;
}

interface PredictionRow {
  title: string;
  contentType: string;
  pv: number;
  upvote: number;
  comment: number;
  collect: number;
  predicted: number;
}

const FEATURE_LABELS: Record<string, string> = {
  pv: '阅读量',
  show: '曝光量',
  upvote: '点赞',
  comment: '评论',
  collect: '收藏',
  share: '分享',
  log_pv: 'log(阅读)',
  log_show: 'log(曝光)',
  log_upvote: 'log(点赞)',
  log_comment: 'log(评论)',
  log_collect: 'log(收藏)',
  engagementRate: '互动率',
  upvoteRate: '点赞率',
  commentRate: '评论率',
  collectRate: '收藏率',
  pvSquared: '阅读量²',
  upvoteSquared: '点赞²',
  pvXupvote: '阅读×点赞',
  pvXcomment: '阅读×评论',
  dayOfWeek_sin: '星期(sin)',
  dayOfWeek_cos: '星期(cos)',
  contentAge: '内容年龄',
  log_contentAge: 'log(内容年龄)',
  pv_ma3: '阅读3日均',
  log_pv_ma3: 'log(阅读3日均)',
  income_lag1: '昨日收益',
  log_income_lag1: 'log(昨日收益)',
};

const STEP_ITEMS = [
  { title: '准备数据' },
  { title: '随机森林' },
  { title: '岭回归' },
  { title: '神经网络' },
  { title: '集成计算' },
  { title: '保存模型' },
];

// ── Demo mode constants ──
const DEMO_TEST_DATES = Array.from({ length: 8 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - 8 + i);
  return d.toISOString().slice(0, 10);
});
const DEMO_ACTUAL = [3.2, 4.1, 2.8, 5.5, 4.9, 3.6, 6.1, 4.3];
const DEMO_PRED = [3.5, 3.8, 3.1, 5.1, 5.2, 3.9, 5.7, 4.6];
const DEMO_FINAL_RESULT: EnsembleResult = {
  models: [
    {
      name: '随机森林',
      predictions: DEMO_PRED,
      r2: 0.78,
      mae: 0.52,
      featureImportance: [
        { name: 'pv', importance: 0.32 },
        { name: 'upvote', importance: 0.18 },
        { name: 'engagementRate', importance: 0.14 },
        { name: 'log_pv', importance: 0.11 },
        { name: 'comment', importance: 0.08 },
        { name: 'collect', importance: 0.06 },
        { name: 'income_lag1', importance: 0.05 },
        { name: 'share', importance: 0.03 },
      ],
    },
    { name: '岭回归', predictions: DEMO_PRED.map((v) => v * 0.95), r2: 0.71, mae: 0.61 },
    { name: '神经网络', predictions: DEMO_PRED.map((v) => v * 1.02), r2: 0.82, mae: 0.45 },
  ],
  ensemble: {
    predictions: DEMO_PRED,
    r2: 0.85,
    mae: 0.41,
    weights: [
      { name: '随机森林', weight: 0.3 },
      { name: '岭回归', weight: 0.2 },
      { name: '神经网络', weight: 0.5 },
    ],
  },
  testActual: DEMO_ACTUAL,
  testDates: DEMO_TEST_DATES,
  featureNames: ['pv', 'upvote', 'comment', 'collect', 'engagementRate'],
  trainedAt: Date.now(),
  dataCount: 156,
  trainCount: 124,
  testCount: 32,
  mlpTrainingInfo: {
    totalEpochs: 100,
    actualEpochs: 67,
    bestEpoch: 54,
    stoppedEarly: true,
    lossHistory: Array.from({ length: 67 }, (_, i) => 0.8 * Math.exp(-i * 0.05) + 0.02),
    valLossHistory: Array.from({ length: 67 }, (_, i) => 0.9 * Math.exp(-i * 0.04) + 0.05),
  },
};
const DEMO_PREDICTIONS: PredictionRow[] = [
  {
    title: '如何高效学习编程',
    contentType: 'article',
    pv: 1820,
    upvote: 45,
    comment: 12,
    collect: 18,
    predicted: 8.52,
  },
  {
    title: '程序员如何提高工作效率',
    contentType: 'answer',
    pv: 1340,
    upvote: 32,
    comment: 8,
    collect: 11,
    predicted: 5.67,
  },
  {
    title: '深入理解 JS 异步编程',
    contentType: 'article',
    pv: 960,
    upvote: 28,
    comment: 6,
    collect: 9,
    predicted: 4.21,
  },
  { title: '前端性能优化技巧', contentType: 'answer', pv: 720, upvote: 19, comment: 4, collect: 6, predicted: 2.89 },
  { title: '善用 TS 的类型收窄', contentType: 'pin', pv: 380, upvote: 14, comment: 3, collect: 4, predicted: 1.35 },
];
const DEMO_TRAINING_STEPS: { label: string; detail: string }[] = [
  { label: '准备数据', detail: '正在准备特征数据，共 156 条...' },
  { label: '随机森林', detail: '训练随机森林（200 棵决策树）...' },
  { label: '岭回归', detail: '训练岭回归模型...' },
  { label: '神经网络', detail: '训练神经网络 128→64→32→16→1...' },
  { label: '集成计算', detail: '计算集成权重...' },
  { label: '保存模型', detail: '保存模型到本地...' },
];
const TOTAL_LOSS_FRAMES = 67;
const LOSS_ANIM_INTERVAL_MS = 40; // ~2.7s total

function accuracyLevel(r2: number): { text: string; color: string; desc: string } {
  if (r2 >= 0.9) return { text: '非常准', color: themeColors.sage, desc: '模型能解释绝大部分收益变化' };
  if (r2 >= 0.7) return { text: '比较准', color: themeColors.warmBlue, desc: '模型能较好地预测收益趋势' };
  if (r2 >= 0.5) return { text: '一般', color: themeColors.amber, desc: '模型能捕捉部分规律，但波动较大' };
  return { text: '不太准', color: themeColors.warmRed, desc: '数据量可能不足，或收益波动太大' };
}

export function MLPredictionPanel({ records, demoMode, demoStep, onDemoAnimating }: Props) {
  const { user } = useCurrentUser();
  const [dailyData, setDailyData] = useState<ContentDailyRecord[]>([]);
  const [allIncomeRecords, setAllIncomeRecords] = useState<IncomeRecord[]>([]);
  const [result, setResult] = useState<EnsembleResult | null>(null);
  const [training, setTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState<TrainingStep | null>(null);
  const [error, setError] = useState('');
  const [dataCount, setDataCount] = useState(0);
  const [loadingModel, setLoadingModel] = useState(true);

  // Prediction state
  const [predicting, setPredicting] = useState(false);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [cacheInfo, setCacheInfo] = useState('');

  useEffect(() => {
    if (!user || demoMode) return;
    setLoadingModel(true);

    Promise.all([
      db.contentDaily.where('userId').equals(user.id).toArray(),
      db.incomeRecords.where('userId').equals(user.id).toArray(),
      loadSavedModel(user.id),
    ])
      .then(([daily, income, saved]) => {
        setDailyData(daily);
        setAllIncomeRecords(income);
        const rows = buildFeatureRows(daily, income);
        setDataCount(rows.length);

        if (saved) {
          setResult(saved.ensembleResult);
        }
      })
      .finally(() => setLoadingModel(false));
  }, [user, demoMode]);

  const handleTrain = useCallback(async () => {
    if (!user) return;
    setTraining(true);
    setError('');
    setResult(null);
    setTrainingStep(null);
    setPredictions([]);
    try {
      const rows = buildFeatureRows(dailyData, allIncomeRecords);
      const res = await trainEnsemble(rows, FEATURE_NAMES, user.id, setTrainingStep);
      if (!res) {
        setError('数据不足，需要至少 10 条每日数据记录（请先在「有收益内容明细」中拉取每日详情）');
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(`训练失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setTraining(false);
      setTrainingStep(null);
    }
  }, [dailyData, allIncomeRecords, user]);

  const CACHE_TTL_MS = 30 * 60 * 1000;

  const handlePredict = useCallback(async () => {
    if (!user) return;
    setPredicting(true);
    setError('');
    setCacheInfo('');
    try {
      // 1. Trigger today's data fetch (service worker handles cache check)
      const resp = await new Promise<{ ok: boolean; count?: number; cached?: number; error?: string }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'fetchTodayContentDaily' },
            (r: { ok: boolean; count?: number; cached?: number; error?: string }) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(r);
            },
          );
        },
      );

      if (!resp.ok) {
        setError(resp.error ?? '拉取今日数据失败');
        return;
      }

      if (resp.cached && resp.cached > 0) {
        setCacheInfo(`使用缓存数据（${resp.cached} 篇）`);
      }

      // 2. Read from cache table, filter out pv=0
      const allCached = await db.contentDailyCache.where('userId').equals(user.id).toArray();
      const cachedRecords = allCached.filter((r) => r.pv > 0);
      if (cachedRecords.length === 0) {
        setError(`今日暂无有效数据（${allCached.length} 篇内容阅读量均为 0）`);
        return;
      }

      // 3. Get historical data for each content (for prevRecords and yesterdayIncome)
      const publishDates = new Map<string, string>();
      const incomeMap = new Map<string, number>();
      for (const r of allIncomeRecords) {
        if (!publishDates.has(r.contentToken) || r.publishDate < publishDates.get(r.contentToken)!) {
          publishDates.set(r.contentToken, r.publishDate);
        }
        const key = `${r.contentToken}:${r.recordDate}`;
        incomeMap.set(key, (incomeMap.get(key) ?? 0) + r.currentIncome / 100);
      }

      const dailyByContent = new Map<string, ContentDailyRecord[]>();
      for (const r of dailyData) {
        const arr = dailyByContent.get(r.contentToken) ?? [];
        arr.push(r);
        dailyByContent.set(r.contentToken, arr);
      }

      // 4. Build features for each cached record
      const features: number[][] = [];
      const contentInfo: {
        title: string;
        contentType: string;
        pv: number;
        upvote: number;
        comment: number;
        collect: number;
      }[] = [];

      for (const record of cachedRecords) {
        const prevRecords = (dailyByContent.get(record.contentToken) ?? []).sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        const publishDate = publishDates.get(record.contentToken) ?? record.date;

        // Yesterday's income for this content
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);
        const yesterdayIncome = incomeMap.get(`${record.contentToken}:${yStr}`) ?? 0;

        const feat = buildPredictionFeatures(record, publishDate, prevRecords, yesterdayIncome);
        features.push(feat);
        contentInfo.push({
          title: record.title,
          contentType: record.contentType,
          pv: record.pv,
          upvote: record.upvote,
          comment: record.comment,
          collect: record.collect,
        });
      }

      // 5. Predict
      const preds = await predictWithSavedModel(user.id, features);
      if (preds) {
        const results = contentInfo
          .map((info, i) => ({
            ...info,
            predicted: preds[i],
          }))
          .sort((a, b) => b.predicted - a.predicted);
        setPredictions(results);
      } else {
        setError('预测失败，请先训练模型');
      }
    } catch (err) {
      setError(`预测失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setPredicting(false);
    }
  }, [user, dailyData, allIncomeRecords]);

  // ── Demo mode: synchronous state derivation from demoStep ──
  // Neural network loss animation frame (only for demoStep=3)
  const [lossFrame, setLossFrame] = useState(0);

  // Compute effective state synchronously so DOM is ready when driver.js queries it
  const demoActive = demoStep !== undefined;
  const effectiveLoadingModel = demoActive ? false : loadingModel;
  const effectiveDataCount = demoActive ? 156 : dataCount;

  const effectiveTraining = demoActive ? demoStep >= 1 && demoStep <= 5 : training;

  const effectiveResult = demoActive ? (demoStep >= 6 ? DEMO_FINAL_RESULT : null) : result;

  const effectivePredictions = demoActive ? (demoStep >= 6 ? DEMO_PREDICTIONS : []) : predictions;

  const effectiveTrainingStep: TrainingStep | null = useMemo(() => {
    if (!demoActive || demoStep < 1 || demoStep > 5) return demoActive ? null : trainingStep;

    // Neural network: use lossFrame for animated progress
    if (demoStep === 3) {
      const epochCount = Math.round((lossFrame / TOTAL_LOSS_FRAMES) * 67);
      const lastLoss = 0.8 * Math.exp(-epochCount * 0.05) + 0.02;
      const lastValLoss = 0.9 * Math.exp(-epochCount * 0.04) + 0.05;
      return {
        step: 4,
        total: 6,
        label: DEMO_TRAINING_STEPS[3].label,
        detail: DEMO_TRAINING_STEPS[3].detail,
        mlpProgress: {
          epoch: epochCount,
          totalEpochs: 100,
          loss: lastLoss,
          valLoss: lastValLoss,
          bestEpoch: lossFrame >= TOTAL_LOSS_FRAMES * 0.7 ? 54 : 0,
          lossHistory: Array.from({ length: epochCount }, (_, j) => 0.8 * Math.exp(-j * 0.05) + 0.02),
          valLossHistory: Array.from({ length: epochCount }, (_, j) => 0.9 * Math.exp(-j * 0.04) + 0.05),
        },
      };
    }

    // Training complete step
    if (demoStep === 5) {
      return { step: 6, total: 6, label: DEMO_TRAINING_STEPS[5].label, detail: DEMO_TRAINING_STEPS[5].detail };
    }

    // Other training steps (1, 2, 4)
    const stepInfo = DEMO_TRAINING_STEPS[demoStep - 1];
    return { step: demoStep, total: 6, label: stepInfo.label, detail: stepInfo.detail };
  }, [demoActive, demoStep, lossFrame, trainingStep]);

  // Neural network loss curve animation (demoStep=3 only)
  useEffect(() => {
    if (demoStep !== 3) {
      setLossFrame(0);
      return;
    }

    onDemoAnimating?.(true);

    // Disable next button immediately
    const nextBtn = document.querySelector('.driver-popover-next-btn');
    if (nextBtn) {
      (nextBtn as HTMLButtonElement).setAttribute('disabled', 'true');
      (nextBtn as HTMLButtonElement).style.opacity = '0.5';
      (nextBtn as HTMLButtonElement).style.cursor = 'not-allowed';
    }

    let frame = 0;
    const interval = setInterval(() => {
      frame += 1;
      setLossFrame(frame);

      if (frame >= TOTAL_LOSS_FRAMES) {
        clearInterval(interval);
        onDemoAnimating?.(false);
        const btn = document.querySelector('.driver-popover-next-btn');
        if (btn) {
          (btn as HTMLButtonElement).removeAttribute('disabled');
          (btn as HTMLButtonElement).style.opacity = '';
          (btn as HTMLButtonElement).style.cursor = '';
        }
      }
    }, LOSS_ANIM_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      onDemoAnimating?.(false);
    };
  }, [demoStep, onDemoAnimating]);

  // Demo mode without active demoStep: show feature description card
  if (demoMode && demoStep === undefined) {
    return (
      <Card title="智能分析" size="small">
        <Flex vertical align="center" gap={16} style={{ padding: '32px 16px' }}>
          <ExperimentOutlined style={{ fontSize: 48, color: themeColors.warmBlue }} />
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>基于机器学习的收益预测</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8 }}>
              同步足够的收益数据后，可以训练模型预测每篇内容的收益趋势。
              模型会综合阅读量、互动数据等多维度特征，给出收益预测和准确度评估。
            </div>
          </div>
        </Flex>
      </Card>
    );
  }

  if (effectiveLoadingModel) {
    return (
      <Card size="small">
        <Flex justify="center" align="center" gap={8} style={{ padding: 40, color: '#999' }}>
          <LoadingOutlined /> 正在加载已保存的模型...
        </Flex>
      </Card>
    );
  }

  // ── Not trained yet ──
  if (!effectiveResult && !effectiveTraining) {
    return (
      <Card size="small">
        <Flex vertical align="center" gap={12} style={{ padding: 20 }}>
          <ExperimentOutlined style={{ fontSize: 32, color: themeColors.warmBlue }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>智能分析</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>分析历史数据，找出哪些因素最影响你的收益</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              训练完成后，会告诉你阅读量、点赞、评论等哪些指标最影响收益
            </div>
            {effectiveDataCount < 10 ? (
              <Alert
                type="warning"
                showIcon
                message={`当前只有 ${effectiveDataCount} 条数据，至少需要 10 条`}
                description="请先在「有收益内容明细」标签页中，点击「拉取所有内容详情」来获取每日数据"
                style={{ marginBottom: 12, textAlign: 'left' }}
              />
            ) : (
              <div style={{ fontSize: 12, color: themeColors.sage, marginBottom: 12 }}>
                <CheckCircleOutlined /> 已有 {effectiveDataCount} 条数据，可以开始训练
              </div>
            )}
            {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
            <Button
              type="primary"
              size="large"
              icon={<ExperimentOutlined />}
              onClick={handleTrain}
              disabled={effectiveDataCount < 10 || demoActive}
            >
              开始训练
            </Button>
          </div>
        </Flex>
      </Card>
    );
  }

  // ── Training in progress ──
  if (effectiveTraining) {
    const currentStepIdx = effectiveTrainingStep ? effectiveTrainingStep.step - 1 : 0;
    const percent = effectiveTrainingStep
      ? Math.round((effectiveTrainingStep.step / effectiveTrainingStep.total) * 100)
      : 0;
    const mlp = effectiveTrainingStep?.mlpProgress;

    const lossChartOption =
      mlp && mlp.lossHistory.length > 1
        ? {
            grid: { left: 45, right: 10, top: 10, bottom: 25 },
            xAxis: {
              type: 'category' as const,
              data: mlp.lossHistory.map((_, i) => i + 1),
              axisLabel: { fontSize: 9 },
              name: '轮次',
              nameGap: 20,
              nameLocation: 'center' as const,
            },
            yAxis: { type: 'value' as const, axisLabel: { fontSize: 9 }, name: 'loss', nameGap: 30 },
            tooltip: {
              trigger: 'axis' as const,
              formatter: (params: LossTooltipParam[]) =>
                params.map((p) => `${p.seriesName}: ${p.value.toFixed(4)}`).join('<br/>'),
            },
            legend: { data: ['训练 loss', '验证 loss'], textStyle: { fontSize: 10 }, right: 0, top: 0 },
            series: [
              {
                name: '训练 loss',
                type: 'line',
                data: mlp.lossHistory,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1.5, color: themeColors.warmBlue },
                itemStyle: { color: themeColors.warmBlue },
              },
              ...(mlp.valLossHistory.length > 0
                ? [
                    {
                      name: '验证 loss',
                      type: 'line' as const,
                      data: mlp.valLossHistory,
                      smooth: true,
                      symbol: 'none',
                      lineStyle: { width: 1.5, color: themeColors.warmRed },
                      itemStyle: { color: themeColors.warmRed },
                    },
                  ]
                : []),
            ],
          }
        : null;

    return (
      <Card
        size="small"
        title={
          <>
            <ExperimentOutlined /> 正在训练模型...
          </>
        }
      >
        <div style={{ padding: '12px 0' }}>
          <Progress percent={percent} status="active" strokeColor={themeColors.warmBlue} style={{ marginBottom: 20 }} />
          <div id="ml-training-steps">
            <Steps
              current={currentStepIdx}
              size="small"
              items={STEP_ITEMS.map((item, i) => ({
                ...item,
                status: i < currentStepIdx ? 'finish' : i === currentStepIdx ? 'process' : 'wait',
                icon: i === currentStepIdx ? <LoadingOutlined /> : undefined,
              }))}
            />
          </div>
          {effectiveTrainingStep?.detail && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                background: '#f5f5f5',
                borderRadius: 8,
                fontSize: 12,
                color: '#666',
              }}
            >
              {effectiveTrainingStep.detail}
            </div>
          )}
          {mlp && (
            <div id="ml-training-neural" style={{ marginTop: 16 }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>神经网络训练进度</span>
                <Flex gap={12} style={{ fontSize: 11, color: '#999' }}>
                  <span>
                    第 {mlp.epoch}/{mlp.totalEpochs} 轮
                  </span>
                  {mlp.bestEpoch && mlp.bestEpoch > 0 && (
                    <span style={{ color: themeColors.sage }}>当前最优: 第 {mlp.bestEpoch} 轮</span>
                  )}
                </Flex>
              </Flex>
              <Progress
                percent={Math.round((mlp.epoch / mlp.totalEpochs) * 100)}
                size="small"
                strokeColor="#8b7bb5"
                format={() => `${mlp.epoch}/${mlp.totalEpochs}`}
              />
              {lossChartOption && (
                <div style={{ marginTop: 12 }}>
                  <ReactECharts option={lossChartOption} style={{ height: 160 }} />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (!effectiveResult) return null;

  // ── Results display ──
  const accuracy = accuracyLevel(effectiveResult.ensemble.r2);
  const bestModel = [...effectiveResult.models].sort((a, b) => b.r2 - a.r2)[0];
  const isBetter = effectiveResult.ensemble.r2 >= bestModel.r2;

  // Feature importance
  const rfModel = effectiveResult.models.find((m) => m.name === '随机森林');
  const importanceData = (rfModel?.featureImportance ?? []).slice(0, 8);

  // Prediction vs actual chart with dates
  const chartDates = (effectiveResult.testDates ?? []).map((d) => d.slice(5));
  const predChartOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: PredictionChartParam[]) => {
        const date = params[0].name;
        const lines = params.map((p) => `${p.marker} ${p.seriesName}: ¥${p.value.toFixed(2)}`);
        return `${date}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['实际收益', '模型预测'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    xAxis: {
      type: 'category' as const,
      data: chartDates.length > 0 ? chartDates : effectiveResult.ensemble.predictions.map((_, i) => `第${i + 1}天`),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` } },
    series: [
      {
        name: '实际收益',
        type: 'bar',
        data: effectiveResult.testActual,
        itemStyle: { color: 'rgba(91, 122, 157, 0.25)', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: '模型预测',
        type: 'line',
        data: effectiveResult.ensemble.predictions,
        itemStyle: { color: themeColors.warmRed },
        lineStyle: { width: 2 },
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
      },
    ],
    ...timeSeriesZoom,
  };

  const topFactors = importanceData.slice(0, 5);

  const predTotal = effectivePredictions.reduce((s, p) => s + p.predicted, 0);
  const predictionColumns: ColumnsType<PredictionRow> = [
    {
      title: '内容',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, row) => (
        <span>
          <Tag color={contentTypeColor(row.contentType)} style={{ marginRight: 4 }}>
            {contentTypeShortLabel(row.contentType)}
          </Tag>
          {title}
        </span>
      ),
    },
    {
      title: '阅读',
      dataIndex: 'pv',
      key: 'pv',
      width: 80,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString(),
    },
    { title: '点赞', dataIndex: 'upvote', key: 'upvote', width: 60, align: 'right' as const },
    { title: '评论', dataIndex: 'comment', key: 'comment', width: 60, align: 'right' as const },
    { title: '收藏', dataIndex: 'collect', key: 'collect', width: 60, align: 'right' as const },
    {
      title: '预测收益',
      dataIndex: 'predicted',
      key: 'predicted',
      width: 100,
      align: 'right' as const,
      sorter: (a, b) => a.predicted - b.predicted,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: themeColors.warmBlue }}>¥{v.toFixed(2)}</span>,
    },
  ];

  return (
    <Flex vertical gap={16}>
      {/* Prediction section */}
      <Card
        title={
          <>
            <ThunderboltOutlined /> 收益预测
          </>
        }
        size="small"
        extra={
          !demoMode && (
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={handlePredict}
              loading={predicting}
              disabled={!effectiveResult}
            >
              {effectivePredictions.length > 0 ? '刷新预测' : '预测各内容收益'}
            </Button>
          )
        }
      >
        {effectivePredictions.length > 0 ? (
          <>
            <Flex align="center" gap={16} style={{ marginBottom: 12 }}>
              <div
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #f0f7ff, #e8f5e9)',
                  borderRadius: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: '#666' }}>预测总收益</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: themeColors.warmBlue }}>
                  ¥{predTotal.toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>
                基于今日实时数据预测每篇内容的收益
                {cacheInfo && <span style={{ marginLeft: 8, color: themeColors.warmBlue }}>({cacheInfo})</span>}
              </div>
            </Flex>
            <Table
              dataSource={effectivePredictions}
              rowKey="title"
              size="small"
              pagination={effectivePredictions.length > 10 ? { pageSize: 10, size: 'small' } : false}
              columns={predictionColumns}
            />
          </>
        ) : (
          <Flex justify="center" style={{ padding: 16, color: '#999', fontSize: 13 }}>
            点击右上角按钮，拉取今日实时数据并预测每篇内容的收益
          </Flex>
        )}
        {error && <Alert type="error" message={error} showIcon style={{ marginTop: 8 }} />}
      </Card>

      {/* Summary card */}
      <Card id="ml-result-accuracy" size="small">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={16}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                background: `${accuracy.color}15`,
                border: `2px solid ${accuracy.color}`,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: accuracy.color, lineHeight: 1 }}>
                {(effectiveResult.ensemble.r2 * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: 9, color: accuracy.color }}>准确度</div>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                模型分析
                <Tag color={accuracy.color} style={{ marginLeft: 8 }}>
                  {accuracy.text}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{accuracy.desc}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                平均每次预测偏差 ¥{effectiveResult.ensemble.mae.toFixed(2)}
              </div>
            </div>
          </Flex>
          <Space direction="vertical" align="end" size={4}>
            {effectiveResult.trainedAt && (
              <span style={{ fontSize: 11, color: '#999' }}>
                <ClockCircleOutlined />{' '}
                {new Date(effectiveResult.trainedAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                })}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#999' }}>
              {effectiveResult.dataCount} 条数据 · 训练 {effectiveResult.trainCount ?? '?'} 条 · 测试{' '}
              {effectiveResult.testCount ?? '?'} 条
            </span>
            <Button
              size="small"
              type={effectiveResult.dataCount < effectiveDataCount ? 'primary' : 'default'}
              onClick={handleTrain}
              loading={training}
              disabled={demoActive}
            >
              {demoActive
                ? '演示数据'
                : effectiveResult.dataCount < dataCount
                  ? `有新数据，重新训练 (${dataCount} 条)`
                  : '重新训练'}
            </Button>
          </Space>
        </Flex>
      </Card>

      {/* Charts */}
      <Card
        id="ml-result-chart"
        title="预测效果验证"
        size="small"
        extra={
          topFactors.length > 0 ? (
            <Flex align="center" gap={4}>
              <span style={{ fontSize: 11, color: '#999' }}>关键因素:</span>
              {topFactors.map((f, i) => (
                <Tag
                  key={f.name}
                  color={['blue', 'green', 'orange', 'purple', 'cyan'][i]}
                  style={{ margin: 0, fontSize: 11 }}
                >
                  {FEATURE_LABELS[f.name] ?? f.name}
                </Tag>
              ))}
            </Flex>
          ) : (
            <span style={{ fontSize: 11, color: '#999' }}>用模型没见过的数据来验证</span>
          )
        }
      >
        <ReactECharts option={predChartOption} style={{ height: 260 }} />
        <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4 }}>
          蓝色柱子 = 实际收益 | 红色线 = 模型预测 | 两者越接近说明模型越准
        </div>
      </Card>

      {/* Model details */}
      <Card
        id="ml-result-models"
        title="三个模型的表现对比"
        size="small"
        extra={<span style={{ fontSize: 11, color: '#999' }}>最终预测由三个模型加权合成</span>}
      >
        <Row gutter={[12, 12]}>
          {effectiveResult.models.map((m) => {
            const mAccuracy = accuracyLevel(m.r2);
            const weight = effectiveResult.ensemble.weights.find((w) => w.name === m.name);
            return (
              <Col span={8} key={m.name}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: m.name === bestModel.name ? '#f0f7ff' : '#fafafa',
                    border:
                      m.name === bestModel.name
                        ? `1px solid ${themeColors.warmBlue}`
                        : `1px solid ${themeColors.border}`,
                  }}
                >
                  <Flex justify="space-between" align="center">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {m.name}
                      {m.name === bestModel.name && (
                        <TrophyOutlined style={{ color: themeColors.amber, marginLeft: 4 }} />
                      )}
                    </span>
                    <Tag color={mAccuracy.color} style={{ margin: 0 }}>
                      {mAccuracy.text}
                    </Tag>
                  </Flex>
                  <div style={{ marginTop: 8 }}>
                    <Flex justify="space-between" style={{ fontSize: 12, color: '#666' }}>
                      <span>准确度</span>
                      <span style={{ fontWeight: 600 }}>{(m.r2 * 100).toFixed(1)}%</span>
                    </Flex>
                    <Progress
                      percent={Math.round(m.r2 * 100)}
                      showInfo={false}
                      size="small"
                      strokeColor={mAccuracy.color}
                      style={{ margin: '4px 0' }}
                    />
                  </div>
                  <Flex justify="space-between" style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    <span>平均偏差 ¥{m.mae.toFixed(2)}</span>
                    {weight && <span>权重 {(weight.weight * 100).toFixed(0)}%</span>}
                  </Flex>
                </div>
              </Col>
            );
          })}
        </Row>
        {isBetter && (
          <div style={{ marginTop: 10, fontSize: 12, color: themeColors.sage, textAlign: 'center' }}>
            <CheckCircleOutlined /> 三个模型合在一起比任何单个模型都更准
          </div>
        )}
      </Card>

      {/* MLP Training Curve */}
      {effectiveResult.mlpTrainingInfo && effectiveResult.mlpTrainingInfo.lossHistory.length > 1 && (
        <Card
          title="神经网络训练曲线"
          size="small"
          extra={
            <span style={{ fontSize: 11, color: '#999' }}>
              {effectiveResult.mlpTrainingInfo.stoppedEarly
                ? `第 ${effectiveResult.mlpTrainingInfo.actualEpochs} 轮早停，最优第 ${effectiveResult.mlpTrainingInfo.bestEpoch} 轮`
                : `共 ${effectiveResult.mlpTrainingInfo.actualEpochs} 轮，最优第 ${effectiveResult.mlpTrainingInfo.bestEpoch} 轮`}
            </span>
          }
        >
          <ReactECharts
            style={{ height: 200 }}
            option={{
              grid: { left: 50, right: 30, top: 30, bottom: 30 },
              tooltip: {
                trigger: 'axis' as const,
                formatter: (params: LossTooltipParam[]) =>
                  params.map((p) => `${p.seriesName}: ${p.value.toFixed(4)}`).join('<br/>'),
              },
              legend: { data: ['训练 loss', '验证 loss'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
              xAxis: {
                type: 'category' as const,
                data: effectiveResult.mlpTrainingInfo.lossHistory.map((_, i) => i + 1),
                axisLabel: { fontSize: 10 },
                name: '轮次',
                nameGap: 20,
                nameLocation: 'center' as const,
              },
              yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 }, name: 'loss' },
              series: [
                {
                  name: '训练 loss',
                  type: 'line',
                  data: effectiveResult.mlpTrainingInfo.lossHistory,
                  smooth: true,
                  symbol: 'none',
                  lineStyle: { width: 1.5, color: themeColors.warmBlue },
                  itemStyle: { color: themeColors.warmBlue },
                },
                ...(effectiveResult.mlpTrainingInfo.valLossHistory.length > 0
                  ? [
                      {
                        name: '验证 loss',
                        type: 'line' as const,
                        data: effectiveResult.mlpTrainingInfo.valLossHistory,
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { width: 1.5, color: themeColors.warmRed },
                        itemStyle: { color: themeColors.warmRed },
                        markLine: {
                          silent: true,
                          data: [
                            {
                              xAxis: effectiveResult.mlpTrainingInfo!.bestEpoch - 1,
                              label: { formatter: `最优 #${effectiveResult.mlpTrainingInfo!.bestEpoch}`, fontSize: 10 },
                            },
                          ],
                          lineStyle: { color: themeColors.sage, type: 'dashed' as const },
                        },
                      },
                    ]
                  : []),
              ],
            }}
          />
          <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>
            蓝线 = 训练 loss | 红线 = 验证 loss | 绿色虚线 = 采用的最优轮次
          </div>
        </Card>
      )}

      <FormulaBlock
        title="模型训练流程说明"
        items={[
          {
            name: '第1步：准备数据',
            formula: '每条数据 = 某篇内容在某天的表现\n包含: 阅读量、点赞、评论、收藏等 19 个特征\n标签: 该天实际收益',
            desc: '按时间顺序排列，前 80% 用来训练模型，后 20% 用来验证模型是否真的学到了东西（模型从未见过验证数据）。',
          },
          {
            name: '第2步：训练三个模型',
            formula:
              '随机森林: 200棵决策树投票取平均\n岭回归: 线性模型（低正则化λ=0.1）\n神经网络: 128→64→32→16→1 四层网络 + BatchNorm + 学习率衰减',
            desc: '三个模型各有所长：随机森林擅长捕捉阈值效应，岭回归擅长线性趋势，深度神经网络擅长复杂非线性关系。特征经过 log 变换处理长尾分布。',
          },
          {
            name: '第3步：集成预测',
            formula: '最终预测 = 随机森林 × 权重1 + 岭回归 × 权重2 + 神经网络 × 权重3\n权重按各模型准确度自动分配',
            desc: '误差越小的模型获得越大的权重。这样即使某个模型预测偏了，其他模型也能拉回来，比单一模型更稳定可靠。',
          },
          {
            name: '收益预测',
            formula: '输入: 某篇内容今天的实时阅读、点赞等数据\n输出: 模型预测该内容今天能赚多少钱',
            desc: '点击预测时会实时拉取今天的数据（缓存30分钟）。新发布的内容只要有了今天的阅读数据就能预测。数据越晚越完整，下午/晚上预测更准。',
          },
        ]}
      />

      <Alert
        type="warning"
        showIcon
        message="免责声明"
        description="智能分析功能仍处于实验阶段，预测结果仅供参考，可能存在较大误差。实际收益受平台算法、广告竞价、内容推荐策略等多种因素影响，请勿将预测结果作为决策依据。"
        style={{ marginTop: 0 }}
      />
    </Flex>
  );
}
