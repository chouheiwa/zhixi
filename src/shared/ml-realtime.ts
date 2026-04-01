/**
 * ML model for predicting daily total income from aggregated realtime metrics.
 * Uses historical RealtimeAggrRecord + DailySummary (for income labels).
 */

import { RandomForestRegression } from 'ml-random-forest';
import { ridgeRegression } from './stats';
import type { RealtimeAggrRecord, DailySummary } from './types';

// ── Feature Names ──

export const REALTIME_FEATURE_NAMES = [
  'pv',
  'show',
  'upvote',
  'comment',
  'collect',
  'share',
  'like',
  'play',
  'reaction',
  'rePin',
  'newIncrUpvoteNum',
  'newDescUpvoteNum',
  'newIncrLikeNum',
  'newDescLikeNum',
  'clickThroughRate',
  'engagementRate',
  'upvoteChurnRate',
  'dayOfWeek_sin',
  'dayOfWeek_cos',
  'pvXupvote',
  'pvXcomment',
  'yesterdayIncome',
];

export const REALTIME_FEATURE_LABELS: Record<string, string> = {
  pv: '阅读量',
  show: '曝光量',
  upvote: '净点赞',
  comment: '评论',
  collect: '收藏',
  share: '分享',
  like: '喜欢',
  play: '播放',
  reaction: '表情反应',
  rePin: '转发',
  newIncrUpvoteNum: '新增赞同',
  newDescUpvoteNum: '取消赞同',
  newIncrLikeNum: '新增喜欢',
  newDescLikeNum: '取消喜欢',
  clickThroughRate: '点击率',
  engagementRate: '互动率',
  upvoteChurnRate: '赞同流失率',
  dayOfWeek_sin: '星期(sin)',
  dayOfWeek_cos: '星期(cos)',
  pvXupvote: '阅读×点赞',
  pvXcomment: '阅读×评论',
  yesterdayIncome: '昨日收益',
};

// ── Feature Engineering ──

interface TrainingRow {
  features: number[];
  label: number; // income in yuan
  date: string;
}

function extractFeatures(record: RealtimeAggrRecord, yesterdayIncome: number): number[] {
  const pv = record.pv;
  const show = record.show;
  const upvote = record.upvote;
  const comment = record.comment;
  const collect = record.collect;
  const share = record.share;

  const totalInteraction = upvote + comment + collect + share;
  const clickThroughRate = show > 0 ? pv / show : 0;
  const engagementRate = pv > 0 ? totalInteraction / pv : 0;
  const upvoteChurnRate = record.newIncrUpvoteNum > 0 ? record.newDescUpvoteNum / record.newIncrUpvoteNum : 0;

  const dow = new Date(record.date).getDay();
  const dayOfWeek_sin = Math.sin((2 * Math.PI * dow) / 7);
  const dayOfWeek_cos = Math.cos((2 * Math.PI * dow) / 7);

  const pvXupvote = (pv * upvote) / 1e4;
  const pvXcomment = (pv * comment) / 1e3;

  return [
    pv,
    show,
    upvote,
    comment,
    collect,
    share,
    record.like,
    record.play,
    record.reaction,
    record.rePin,
    record.newIncrUpvoteNum,
    record.newDescUpvoteNum,
    record.newIncrLikeNum,
    record.newDescLikeNum,
    clickThroughRate,
    engagementRate,
    upvoteChurnRate,
    dayOfWeek_sin,
    dayOfWeek_cos,
    pvXupvote,
    pvXcomment,
    yesterdayIncome,
  ];
}

/**
 * Build training rows by matching RealtimeAggrRecords with DailySummary income data.
 */
export function buildRealtimeTrainingRows(aggrRecords: RealtimeAggrRecord[], summaries: DailySummary[]): TrainingRow[] {
  const incomeMap = new Map(summaries.map((s) => [s.date, s.totalIncome / 100]));
  const sorted = [...aggrRecords].sort((a, b) => a.date.localeCompare(b.date));

  const rows: TrainingRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const record = sorted[i];
    const income = incomeMap.get(record.date);
    if (income === undefined || income <= 0) continue;

    const yesterdayIncome = i > 0 ? (incomeMap.get(sorted[i - 1].date) ?? 0) : 0;
    rows.push({
      features: extractFeatures(record, yesterdayIncome),
      label: income,
      date: record.date,
    });
  }

  return rows;
}

/**
 * Build feature vector for today's prediction.
 */
export function buildTodayFeatures(todayRecord: RealtimeAggrRecord, yesterdayIncome: number): number[] {
  return extractFeatures(todayRecord, yesterdayIncome);
}

// ── Model Training ──

function calcR2(actual: number[], predicted: number[]): number {
  let mean = 0;
  for (const v of actual) mean += v;
  mean /= actual.length;
  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < actual.length; i++) {
    ssTot += (actual[i] - mean) ** 2;
    ssRes += (actual[i] - predicted[i]) ** 2;
  }
  return ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
}

function calcMAE(actual: number[], predicted: number[]): number {
  let sum = 0;
  for (let i = 0; i < actual.length; i++) sum += Math.abs(actual[i] - predicted[i]);
  return sum / actual.length;
}

export interface RealtimeModelResult {
  rfPredictions: number[];
  ridgePredictions: number[];
  ensemblePredictions: number[];
  testActual: number[];
  testDates: string[];
  r2: number;
  mae: number;
  rfR2: number;
  ridgeR2: number;
  rfWeight: number;
  ridgeWeight: number;
  featureImportance: { name: string; importance: number }[];
  trainCount: number;
  testCount: number;
  dataCount: number;
  trainedAt: number;
}

export interface SavedRealtimeModel {
  rfJson: string;
  ridgeCoefficients: number[];
  rfWeight: number;
  ridgeWeight: number;
  evaluation: string; // JSON of RealtimeModelResult
}

export interface RealtimeTrainOutput {
  result: RealtimeModelResult;
  savedModel: SavedRealtimeModel;
}

export function trainRealtimeModel(
  rows: TrainingRow[],
  onProgress?: (step: { step: number; total: number; label: string }) => void,
): RealtimeTrainOutput | null {
  if (rows.length < 10) return null;

  onProgress?.({ step: 1, total: 4, label: '准备数据' });

  // Time-based split
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const splitIdx = Math.floor(sorted.length * 0.8);
  const trainX = sorted.slice(0, splitIdx).map((r) => r.features);
  const trainY = sorted.slice(0, splitIdx).map((r) => r.label);
  const testX = sorted.slice(splitIdx).map((r) => r.features);
  const testY = sorted.slice(splitIdx).map((r) => r.label);
  const testDates = sorted.slice(splitIdx).map((r) => r.date);

  if (trainX.length < 5 || testX.length < 3) return null;

  // Random Forest
  onProgress?.({ step: 2, total: 4, label: '训练随机森林' });
  const rf = new RandomForestRegression({
    nEstimators: 50,
    maxFeatures: Math.max(1, Math.floor(Math.sqrt(trainX[0].length))),
    seed: 42,
    replacement: true,
  });
  rf.train(trainX, trainY);
  const rfPred = rf.predict(testX) as number[];

  // Feature importance via permutation
  const baseMAE = calcMAE(testY, rfPred);
  const importance = REALTIME_FEATURE_NAMES.map((name, j) => {
    const shuffled = testX.map((row) => [...row]);
    const vals = shuffled.map((row) => row[j]);
    for (let i = vals.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[k]] = [vals[k], vals[i]];
    }
    shuffled.forEach((row, i) => {
      row[j] = vals[i];
    });
    const shuffledPred = rf.predict(shuffled) as number[];
    return { name, importance: Math.max(0, calcMAE(testY, shuffledPred) - baseMAE) };
  }).sort((a, b) => b.importance - a.importance);

  const totalImp = importance.reduce((s, i) => s + i.importance, 0);
  if (totalImp > 0)
    importance.forEach((i) => {
      i.importance = (i.importance / totalImp) * 100;
    });

  // Ridge Regression
  onProgress?.({ step: 3, total: 4, label: '训练岭回归' });
  const d = trainX[0].length;
  const xs = Array.from({ length: d }, (_, j) => trainX.map((row) => row[j]));
  const reg = ridgeRegression(xs, trainY, 1.0);
  const ridgePred = testX.map((row) => {
    let pred = reg.coefficients[0];
    for (let j = 0; j < d; j++) pred += reg.coefficients[j + 1] * row[j];
    return Math.max(0, pred);
  });

  // Ensemble (no MLP to keep it fast for realtime)
  onProgress?.({ step: 4, total: 4, label: '计算集成结果' });
  const rfMAE = calcMAE(testY, rfPred);
  const ridgeMAE = calcMAE(testY, ridgePred);
  const invRf = 1 / (rfMAE + 0.01);
  const invRidge = 1 / (ridgeMAE + 0.01);
  const totalInv = invRf + invRidge;
  const rfWeight = invRf / totalInv;
  const ridgeWeight = invRidge / totalInv;

  const ensemblePred = testY.map((_, i) => Math.max(0, rfWeight * rfPred[i] + ridgeWeight * ridgePred[i]));

  const rfJson = JSON.stringify(rf.toJSON());

  const result: RealtimeModelResult = {
    rfPredictions: rfPred,
    ridgePredictions: ridgePred,
    ensemblePredictions: ensemblePred,
    testActual: testY,
    testDates,
    r2: calcR2(testY, ensemblePred),
    mae: calcMAE(testY, ensemblePred),
    rfR2: calcR2(testY, rfPred),
    ridgeR2: calcR2(testY, ridgePred),
    rfWeight,
    ridgeWeight,
    featureImportance: importance,
    trainCount: trainX.length,
    testCount: testX.length,
    dataCount: rows.length,
    trainedAt: Date.now(),
  };

  return {
    result,
    savedModel: {
      rfJson,
      ridgeCoefficients: reg.coefficients,
      rfWeight,
      ridgeWeight,
      evaluation: JSON.stringify(result),
    },
  };
}

/**
 * Predict using saved model weights.
 */
export function predictWithRealtimeModel(saved: SavedRealtimeModel, features: number[]): number {
  const rf = RandomForestRegression.load(JSON.parse(saved.rfJson));
  const rfPred = (rf.predict([features]) as number[])[0];

  const d = features.length;
  let ridgePred = saved.ridgeCoefficients[0];
  for (let j = 0; j < d; j++) ridgePred += saved.ridgeCoefficients[j + 1] * features[j];
  ridgePred = Math.max(0, ridgePred);

  return Math.max(0, saved.rfWeight * rfPred + saved.ridgeWeight * ridgePred);
}
