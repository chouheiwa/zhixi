import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Button, Tag, Progress, Flex, Empty, Alert, Space, Steps, Table } from 'antd';
import { ExperimentOutlined, TrophyOutlined, CheckCircleOutlined, LoadingOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { IncomeRecord, ContentDailyRecord } from '@/shared/types';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import { buildFeatureRows, buildPredictionFeatures, FEATURE_NAMES } from '@/shared/ml-features';
import { trainEnsemble, loadSavedModel, predictWithSavedModel, type EnsembleResult, type TrainingStep } from '@/shared/ml-models';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';

interface Props {
  records: IncomeRecord[];
}

const FEATURE_LABELS: Record<string, string> = {
  pv: '阅读量', show: '曝光量', upvote: '点赞', comment: '评论',
  collect: '收藏', share: '分享',
  log_pv: 'log(阅读)', log_show: 'log(曝光)', log_upvote: 'log(点赞)',
  log_comment: 'log(评论)', log_collect: 'log(收藏)',
  engagementRate: '互动率', upvoteRate: '点赞率', commentRate: '评论率', collectRate: '收藏率',
  pvSquared: '阅读量²', upvoteSquared: '点赞²',
  pvXupvote: '阅读×点赞', pvXcomment: '阅读×评论',
  dayOfWeek_sin: '星期(sin)', dayOfWeek_cos: '星期(cos)',
  contentAge: '内容年龄', log_contentAge: 'log(内容年龄)',
  pv_ma3: '阅读3日均', log_pv_ma3: 'log(阅读3日均)',
  income_lag1: '昨日收益', log_income_lag1: 'log(昨日收益)',
};

const STEP_ITEMS = [
  { title: '准备数据' },
  { title: '随机森林' },
  { title: '岭回归' },
  { title: '神经网络' },
  { title: '集成计算' },
  { title: '保存模型' },
];

function accuracyLevel(r2: number): { text: string; color: string; desc: string } {
  if (r2 >= 0.9) return { text: '非常准', color: themeColors.sage, desc: '模型能解释绝大部分收益变化' };
  if (r2 >= 0.7) return { text: '比较准', color: themeColors.warmBlue, desc: '模型能较好地预测收益趋势' };
  if (r2 >= 0.5) return { text: '一般', color: themeColors.amber, desc: '模型能捕捉部分规律，但波动较大' };
  return { text: '不太准', color: themeColors.warmRed, desc: '数据量可能不足，或收益波动太大' };
}

export function MLPredictionPanel({ records }: Props) {
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
  const [predictions, setPredictions] = useState<{ title: string; contentType: string; pv: number; upvote: number; comment: number; collect: number; predicted: number }[]>([]);
  const [cacheInfo, setCacheInfo] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoadingModel(true);

    Promise.all([
      db.contentDaily.where('userId').equals(user.id).toArray(),
      db.incomeRecords.where('userId').equals(user.id).toArray(),
      loadSavedModel(user.id),
    ]).then(([daily, income, saved]) => {
      setDailyData(daily);
      setAllIncomeRecords(income);
      const rows = buildFeatureRows(daily, income);
      setDataCount(rows.length);

      if (saved) {
        setResult(saved.ensembleResult);
      }
    }).finally(() => setLoadingModel(false));
  }, [user]);

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
        setError('数据不足，需要至少 10 条每日数据记录（请先在「内容明细」中拉取每日详情）');
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
      const resp = await new Promise<{ ok: boolean; count?: number; cached?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchTodayContentDaily' }, (r) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(r);
        });
      });

      if (!resp.ok) {
        setError(resp.error ?? '拉取今日数据失败');
        return;
      }

      if (resp.cached && resp.cached > 0) {
        setCacheInfo(`使用缓存数据（${resp.cached} 篇）`);
      }

      // 2. Read from cache table, filter out pv=0
      const allCached = await db.contentDailyCache.where('userId').equals(user.id).toArray();
      const cachedRecords = allCached.filter(r => r.pv > 0);
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
      const contentInfo: { title: string; contentType: string; pv: number; upvote: number; comment: number; collect: number }[] = [];

      for (const record of cachedRecords) {
        const prevRecords = (dailyByContent.get(record.contentToken) ?? [])
          .sort((a, b) => a.date.localeCompare(b.date));
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
        const results = contentInfo.map((info, i) => ({
          ...info,
          predicted: preds[i],
        })).sort((a, b) => b.predicted - a.predicted);
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

  if (loadingModel) {
    return (
      <Card size="small">
        <Flex justify="center" align="center" gap={8} style={{ padding: 40, color: '#999' }}>
          <LoadingOutlined /> 正在加载已保存的模型...
        </Flex>
      </Card>
    );
  }

  // ── Not trained yet ──
  if (!result && !training) {
    return (
      <Card size="small">
        <Flex vertical align="center" gap={12} style={{ padding: 20 }}>
          <ExperimentOutlined style={{ fontSize: 32, color: themeColors.warmBlue }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>智能分析</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              分析历史数据，找出哪些因素最影响你的收益
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              训练完成后，会告诉你阅读量、点赞、评论等哪些指标最影响收益
            </div>
            {dataCount < 10 ? (
              <Alert
                type="warning"
                showIcon
                message={`当前只有 ${dataCount} 条数据，至少需要 10 条`}
                description="请先在「内容明细」标签页中，点击「拉取所有内容详情」来获取每日数据"
                style={{ marginBottom: 12, textAlign: 'left' }}
              />
            ) : (
              <div style={{ fontSize: 12, color: themeColors.sage, marginBottom: 12 }}>
                <CheckCircleOutlined /> 已有 {dataCount} 条数据，可以开始训练
              </div>
            )}
            {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
            <Button type="primary" size="large" icon={<ExperimentOutlined />} onClick={handleTrain} disabled={dataCount < 10}>
              开始训练
            </Button>
          </div>
        </Flex>
      </Card>
    );
  }

  // ── Training in progress ──
  if (training) {
    const currentStepIdx = trainingStep ? trainingStep.step - 1 : 0;
    const percent = trainingStep ? Math.round((trainingStep.step / trainingStep.total) * 100) : 0;
    const mlp = trainingStep?.mlpProgress;

    const lossChartOption = mlp && mlp.lossHistory.length > 1 ? {
      grid: { left: 45, right: 10, top: 10, bottom: 25 },
      xAxis: { type: 'category' as const, data: mlp.lossHistory.map((_, i) => i + 1), axisLabel: { fontSize: 9 }, name: '轮次', nameGap: 20, nameLocation: 'center' as const },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 9 }, name: 'loss', nameGap: 30 },
      tooltip: { trigger: 'axis' as const, formatter: (params: any[]) => params.map((p: any) => `${p.seriesName}: ${p.value.toFixed(4)}`).join('<br/>') },
      legend: { data: ['训练 loss', '验证 loss'], textStyle: { fontSize: 10 }, right: 0, top: 0 },
      series: [
        { name: '训练 loss', type: 'line', data: mlp.lossHistory, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: themeColors.warmBlue }, itemStyle: { color: themeColors.warmBlue } },
        ...(mlp.valLossHistory.length > 0 ? [{
          name: '验证 loss', type: 'line' as const, data: mlp.valLossHistory, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: themeColors.warmRed }, itemStyle: { color: themeColors.warmRed },
        }] : []),
      ],
    } : null;

    return (
      <Card size="small" title={<><ExperimentOutlined /> 正在训练模型...</>}>
        <div style={{ padding: '12px 0' }}>
          <Progress percent={percent} status="active" strokeColor={themeColors.warmBlue} style={{ marginBottom: 20 }} />
          <Steps
            current={currentStepIdx}
            size="small"
            items={STEP_ITEMS.map((item, i) => ({
              ...item,
              status: i < currentStepIdx ? 'finish' : i === currentStepIdx ? 'process' : 'wait',
              icon: i === currentStepIdx ? <LoadingOutlined /> : undefined,
            }))}
          />
          {trainingStep?.detail && (
            <div style={{ marginTop: 16, padding: '10px 12px', background: '#f5f5f5', borderRadius: 8, fontSize: 12, color: '#666' }}>
              {trainingStep.detail}
            </div>
          )}
          {mlp && (
            <div style={{ marginTop: 16 }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>神经网络训练进度</span>
                <Flex gap={12} style={{ fontSize: 11, color: '#999' }}>
                  <span>第 {mlp.epoch}/{mlp.totalEpochs} 轮</span>
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

  if (!result) return null;

  // ── Results display ──
  const accuracy = accuracyLevel(result.ensemble.r2);
  const bestModel = [...result.models].sort((a, b) => b.r2 - a.r2)[0];
  const isBetter = result.ensemble.r2 >= bestModel.r2;

  // Feature importance
  const rfModel = result.models.find(m => m.name === '随机森林');
  const importanceData = (rfModel?.featureImportance ?? []).slice(0, 8);

  // Prediction vs actual chart with dates
  const chartDates = (result.testDates ?? []).map(d => d.slice(5));
  const predChartOption = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any[]) => {
        const date = params[0].name;
        const lines = params.map((p: any) => `${p.marker} ${p.seriesName}: ¥${p.value.toFixed(2)}`);
        return `${date}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: { data: ['实际收益', '模型预测'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 50, right: 30, top: 30, bottom: 25 }),
    xAxis: {
      type: 'category' as const,
      data: chartDates.length > 0 ? chartDates : result.ensemble.predictions.map((_, i) => `第${i + 1}天`),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` } },
    series: [
      {
        name: '实际收益',
        type: 'bar',
        data: result.testActual,
        itemStyle: { color: 'rgba(91, 122, 157, 0.25)', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: '模型预测',
        type: 'line',
        data: result.ensemble.predictions,
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

  const predTotal = predictions.reduce((s, p) => s + p.predicted, 0);

  return (
    <Flex vertical gap={16}>
      {/* Prediction section */}
      <Card
        title={<><ThunderboltOutlined /> 收益预测</>}
        size="small"
        extra={
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={handlePredict}
            loading={predicting}
            disabled={!result}
          >
            {predictions.length > 0 ? '刷新预测' : '预测各内容收益'}
          </Button>
        }
      >
        {predictions.length > 0 ? (
          <>
            <Flex align="center" gap={16} style={{ marginBottom: 12 }}>
              <div style={{
                padding: '8px 16px', background: 'linear-gradient(135deg, #f0f7ff, #e8f5e9)',
                borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: '#666' }}>预测总收益</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: themeColors.warmBlue }}>¥{predTotal.toFixed(2)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>
                基于今日实时数据预测每篇内容的收益
                {cacheInfo && <span style={{ marginLeft: 8, color: themeColors.warmBlue }}>({cacheInfo})</span>}
              </div>
            </Flex>
            <Table
              dataSource={predictions}
              rowKey="title"
              size="small"
              pagination={predictions.length > 10 ? { pageSize: 10, size: 'small' } : false}
              columns={[
                {
                  title: '内容', dataIndex: 'title', key: 'title', ellipsis: true,
                  render: (title: string, row: any) => (
                    <span>
                      <Tag color={row.contentType === 'article' ? 'blue' : 'gold'} style={{ marginRight: 4 }}>
                        {row.contentType === 'article' ? '文' : '答'}
                      </Tag>
                      {title}
                    </span>
                  ),
                },
                { title: '阅读', dataIndex: 'pv', key: 'pv', width: 80, align: 'right' as const, render: (v: number) => v.toLocaleString() },
                { title: '点赞', dataIndex: 'upvote', key: 'upvote', width: 60, align: 'right' as const },
                { title: '评论', dataIndex: 'comment', key: 'comment', width: 60, align: 'right' as const },
                { title: '收藏', dataIndex: 'collect', key: 'collect', width: 60, align: 'right' as const },
                {
                  title: '预测收益', dataIndex: 'predicted', key: 'predicted', width: 100, align: 'right' as const,
                  sorter: (a: any, b: any) => a.predicted - b.predicted,
                  defaultSortOrder: 'descend' as const,
                  render: (v: number) => <span style={{ fontWeight: 600, color: themeColors.warmBlue }}>¥{v.toFixed(2)}</span>,
                },
              ]}
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
      <Card size="small">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={16}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              background: `${accuracy.color}15`, border: `2px solid ${accuracy.color}`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: accuracy.color, lineHeight: 1 }}>
                {(result.ensemble.r2 * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: 9, color: accuracy.color }}>准确度</div>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                模型分析<Tag color={accuracy.color} style={{ marginLeft: 8 }}>{accuracy.text}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{accuracy.desc}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                平均每次预测偏差 ¥{result.ensemble.mae.toFixed(2)}
              </div>
            </div>
          </Flex>
          <Space direction="vertical" align="end" size={4}>
            {result.trainedAt && (
              <span style={{ fontSize: 11, color: '#999' }}>
                <ClockCircleOutlined /> {new Date(result.trainedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#999' }}>
              {result.dataCount} 条数据 · 训练 {result.trainCount ?? '?'} 条 · 测试 {result.testCount ?? '?'} 条
            </span>
            <Button
              size="small"
              type={result.dataCount < dataCount ? 'primary' : 'default'}
              onClick={handleTrain}
              loading={training}
            >
              {result.dataCount < dataCount ? `有新数据，重新训练 (${dataCount} 条)` : '重新训练'}
            </Button>
          </Space>
        </Flex>
      </Card>

      {/* Charts */}
      <Card title="预测效果验证" size="small" extra={
        topFactors.length > 0 ? (
          <Flex align="center" gap={4}>
            <span style={{ fontSize: 11, color: '#999' }}>关键因素:</span>
            {topFactors.map((f, i) => (
              <Tag key={f.name} color={['blue', 'green', 'orange', 'purple', 'cyan'][i]} style={{ margin: 0, fontSize: 11 }}>
                {FEATURE_LABELS[f.name] ?? f.name}
              </Tag>
            ))}
          </Flex>
        ) : <span style={{ fontSize: 11, color: '#999' }}>用模型没见过的数据来验证</span>
      }>
        <ReactECharts option={predChartOption} style={{ height: 260 }} />
        <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4 }}>
          蓝色柱子 = 实际收益 | 红色线 = 模型预测 | 两者越接近说明模型越准
        </div>
      </Card>

      {/* Model details */}
      <Card title="三个模型的表现对比" size="small" extra={<span style={{ fontSize: 11, color: '#999' }}>最终预测由三个模型加权合成</span>}>
        <Row gutter={[12, 12]}>
          {result.models.map(m => {
            const mAccuracy = accuracyLevel(m.r2);
            const weight = result.ensemble.weights.find(w => w.name === m.name);
            return (
              <Col span={8} key={m.name}>
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: m.name === bestModel.name ? '#f0f7ff' : '#fafafa',
                  border: m.name === bestModel.name ? `1px solid ${themeColors.warmBlue}` : `1px solid ${themeColors.border}`,
                }}>
                  <Flex justify="space-between" align="center">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {m.name}
                      {m.name === bestModel.name && <TrophyOutlined style={{ color: themeColors.amber, marginLeft: 4 }} />}
                    </span>
                    <Tag color={mAccuracy.color} style={{ margin: 0 }}>{mAccuracy.text}</Tag>
                  </Flex>
                  <div style={{ marginTop: 8 }}>
                    <Flex justify="space-between" style={{ fontSize: 12, color: '#666' }}>
                      <span>准确度</span>
                      <span style={{ fontWeight: 600 }}>{(m.r2 * 100).toFixed(1)}%</span>
                    </Flex>
                    <Progress percent={Math.round(m.r2 * 100)} showInfo={false} size="small" strokeColor={mAccuracy.color} style={{ margin: '4px 0' }} />
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
      {result.mlpTrainingInfo && result.mlpTrainingInfo.lossHistory.length > 1 && (
        <Card
          title="神经网络训练曲线"
          size="small"
          extra={
            <span style={{ fontSize: 11, color: '#999' }}>
              {result.mlpTrainingInfo.stoppedEarly
                ? `第 ${result.mlpTrainingInfo.actualEpochs} 轮早停，最优第 ${result.mlpTrainingInfo.bestEpoch} 轮`
                : `共 ${result.mlpTrainingInfo.actualEpochs} 轮，最优第 ${result.mlpTrainingInfo.bestEpoch} 轮`
              }
            </span>
          }
        >
          <ReactECharts
            style={{ height: 200 }}
            option={{
              grid: { left: 50, right: 30, top: 30, bottom: 30 },
              tooltip: { trigger: 'axis' as const, formatter: (params: any[]) => params.map((p: any) => `${p.seriesName}: ${p.value.toFixed(4)}`).join('<br/>') },
              legend: { data: ['训练 loss', '验证 loss'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
              xAxis: { type: 'category' as const, data: result.mlpTrainingInfo.lossHistory.map((_, i) => i + 1), axisLabel: { fontSize: 10 }, name: '轮次', nameGap: 20, nameLocation: 'center' as const },
              yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 }, name: 'loss' },
              series: [
                { name: '训练 loss', type: 'line', data: result.mlpTrainingInfo.lossHistory, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: themeColors.warmBlue }, itemStyle: { color: themeColors.warmBlue } },
                ...(result.mlpTrainingInfo.valLossHistory.length > 0 ? [{
                  name: '验证 loss', type: 'line' as const, data: result.mlpTrainingInfo.valLossHistory, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: themeColors.warmRed }, itemStyle: { color: themeColors.warmRed },
                  markLine: {
                    silent: true,
                    data: [{ xAxis: result.mlpTrainingInfo!.bestEpoch - 1, label: { formatter: `最优 #${result.mlpTrainingInfo!.bestEpoch}`, fontSize: 10 } }],
                    lineStyle: { color: themeColors.sage, type: 'dashed' as const },
                  },
                }] : []),
              ],
            }}
          />
          <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>
            蓝线 = 训练 loss | 红线 = 验证 loss | 绿色虚线 = 采用的最优轮次
          </div>
        </Card>
      )}

      <FormulaBlock title="模型训练流程说明" items={[
        { name: '第1步：准备数据', formula: '每条数据 = 某篇内容在某天的表现\n包含: 阅读量、点赞、评论、收藏等 19 个特征\n标签: 该天实际收益', desc: '按时间顺序排列，前 80% 用来训练模型，后 20% 用来验证模型是否真的学到了东西（模型从未见过验证数据）。' },
        { name: '第2步：训练三个模型', formula: '随机森林: 200棵决策树投票取平均\n岭回归: 线性模型（低正则化λ=0.1）\n神经网络: 128→64→32→16→1 四层网络 + BatchNorm + 学习率衰减', desc: '三个模型各有所长：随机森林擅长捕捉阈值效应，岭回归擅长线性趋势，深度神经网络擅长复杂非线性关系。特征经过 log 变换处理长尾分布。' },
        { name: '第3步：集成预测', formula: '最终预测 = 随机森林 × 权重1 + 岭回归 × 权重2 + 神经网络 × 权重3\n权重按各模型准确度自动分配', desc: '误差越小的模型获得越大的权重。这样即使某个模型预测偏了，其他模型也能拉回来，比单一模型更稳定可靠。' },
        { name: '收益预测', formula: '输入: 某篇内容今天的实时阅读、点赞等数据\n输出: 模型预测该内容今天能赚多少钱', desc: '点击预测时会实时拉取今天的数据（缓存30分钟）。新发布的内容只要有了今天的阅读数据就能预测。数据越晚越完整，下午/晚上预测更准。' },
      ]} />

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
