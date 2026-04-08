/**
 * ML models for income prediction.
 * - Random Forest (ml-random-forest)
 * - MLP Neural Network (TensorFlow.js)
 * - Ridge Regression (existing)
 * - Ensemble (weighted average)
 * - Persistence (IndexedDB)
 */

import { RandomForestRegression } from 'ml-random-forest';
import * as tf from '@tensorflow/tfjs';
import { ridgeRegression } from './stats';
import { fitScaler, transformFeatures, type Scaler, type FeatureRow } from './ml-features';
import { db, type SavedMLModel } from '@/db/database';

const MLP_MODEL_PATH = 'indexeddb://zhixi-mlp-model';

// ── Model Results ──

export interface ModelResult {
  name: string;
  predictions: number[];
  r2: number;
  mae: number;
  featureImportance?: { name: string; importance: number }[];
}

export interface MLPTrainingInfo {
  totalEpochs: number;
  actualEpochs: number;
  bestEpoch: number;
  stoppedEarly: boolean;
  lossHistory: number[];
  valLossHistory: number[];
}

export interface EvaluationResult {
  models: ModelResult[];
  ensemble: {
    predictions: number[];
    r2: number;
    mae: number;
    weights: { name: string; weight: number }[];
  };
  testActual: number[];
  testDates: string[];
  featureNames: string[];
  trainedAt: number;
  dataCount: number;
  trainCount: number;
  testCount: number;
  mlpTrainingInfo?: MLPTrainingInfo;
}

export type EnsembleResult = EvaluationResult;

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function isFeatureImportanceList(value: unknown): value is NonNullable<ModelResult['featureImportance']> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.name === 'string' &&
        typeof item.importance === 'number',
    )
  );
}

function isModelResult(value: unknown): value is ModelResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    isNumberArray(v.predictions) &&
    typeof v.r2 === 'number' &&
    typeof v.mae === 'number' &&
    (v.featureImportance === undefined || isFeatureImportanceList(v.featureImportance))
  );
}

function isWeightList(value: unknown): value is EvaluationResult['ensemble']['weights'] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null && typeof item === 'object' && typeof item.name === 'string' && typeof item.weight === 'number',
    )
  );
}

function isMLPTrainingInfo(value: unknown): value is MLPTrainingInfo {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.totalEpochs === 'number' &&
    typeof v.actualEpochs === 'number' &&
    typeof v.bestEpoch === 'number' &&
    typeof v.stoppedEarly === 'boolean' &&
    isNumberArray(v.lossHistory) &&
    isNumberArray(v.valLossHistory)
  );
}

export function isEvaluationResult(value: unknown): value is EvaluationResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.models) || !v.models.every(isModelResult)) return false;
  if (v.ensemble === null || typeof v.ensemble !== 'object') return false;
  const e = v.ensemble as Record<string, unknown>;
  return (
    isNumberArray(e.predictions) &&
    typeof e.r2 === 'number' &&
    typeof e.mae === 'number' &&
    isWeightList(e.weights) &&
    isNumberArray(v.testActual) &&
    Array.isArray(v.testDates) &&
    (v.testDates as unknown[]).every((item) => typeof item === 'string') &&
    Array.isArray(v.featureNames) &&
    (v.featureNames as unknown[]).every((item) => typeof item === 'string') &&
    typeof v.trainedAt === 'number' &&
    typeof v.dataCount === 'number' &&
    typeof v.trainCount === 'number' &&
    typeof v.testCount === 'number' &&
    (v.mlpTrainingInfo === undefined || isMLPTrainingInfo(v.mlpTrainingInfo))
  );
}

function parseEvaluationResult(value: SavedMLModel['evaluationResult']): EvaluationResult | null {
  if (isEvaluationResult(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isEvaluationResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Metrics ──

/** Weighted R²: higher-income data points contribute more */
function calcR2(actual: number[], predicted: number[]): number {
  const weights = actual.map((v) => Math.max(v, 0.01));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let wMean = 0;
  for (let i = 0; i < actual.length; i++) wMean += weights[i] * actual[i];
  wMean /= totalWeight;
  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < actual.length; i++) {
    ssTot += weights[i] * (actual[i] - wMean) ** 2;
    ssRes += weights[i] * (actual[i] - predicted[i]) ** 2;
  }
  return ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
}

/** Weighted MAE: higher-income data points contribute more */
function calcMAE(actual: number[], predicted: number[]): number {
  const weights = actual.map((v) => Math.max(v, 0.01));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let i = 0; i < actual.length; i++) sum += weights[i] * Math.abs(actual[i] - predicted[i]);
  return sum / totalWeight;
}

// ── Random Forest ──

function trainRandomForest(
  trainX: number[][],
  trainY: number[],
  testX: number[][],
  testY: number[],
  featureNames: string[],
): { result: ModelResult; model: RandomForestRegression } {
  const rf = new RandomForestRegression({
    nEstimators: 200,
    maxFeatures: Math.max(1, Math.floor(Math.sqrt(trainX[0].length))),
    seed: 42,
    replacement: true,
  });
  rf.train(trainX, trainY);
  const predictions = rf.predict(testX) as number[];

  const baseMAE = calcMAE(testY, predictions);
  const importance = featureNames
    .map((name, j) => {
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
    })
    .sort((a, b) => b.importance - a.importance);

  const totalImp = importance.reduce((s, i) => s + i.importance, 0);
  if (totalImp > 0)
    importance.forEach((i) => {
      i.importance = (i.importance / totalImp) * 100;
    });

  return {
    result: {
      name: '随机森林',
      predictions,
      r2: calcR2(testY, predictions),
      mae: calcMAE(testY, predictions),
      featureImportance: importance,
    },
    model: rf,
  };
}

// ── MLP Neural Network ──

async function trainMLP(
  trainX: number[][],
  trainY: number[],
  testX: number[][],
  testY: number[],
  scaler: Scaler,
  onEpoch?: (
    epoch: number,
    totalEpochs: number,
    loss: number,
    valLoss?: number,
    lossHistory?: number[],
    valLossHistory?: number[],
  ) => void,
): Promise<{ result: ModelResult; labelMean: number; labelStd: number; trainingInfo: MLPTrainingInfo }> {
  const inputDim = trainX[0].length;
  const normTrainX = transformFeatures(trainX, scaler);
  const normTestX = transformFeatures(testX, scaler);

  const labelMean = trainY.reduce((a, b) => a + b, 0) / trainY.length;
  let labelStd = 0;
  for (const v of trainY) labelStd += (v - labelMean) ** 2;
  labelStd = Math.sqrt(labelStd / trainY.length) || 1;
  const normTrainY = trainY.map((v) => (v - labelMean) / labelStd);

  const model = tf.sequential();
  // Layer 1: 128 units + BatchNorm + Dropout
  model.add(tf.layers.dense({ units: 128, inputShape: [inputDim] }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.activation({ activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  // Layer 2: 64 units + BatchNorm + Dropout
  model.add(tf.layers.dense({ units: 64 }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.activation({ activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  // Layer 3: 32 units + BatchNorm
  model.add(tf.layers.dense({ units: 32 }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.activation({ activation: 'relu' }));
  // Layer 4: 16 units
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  // Output
  model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

  const initialLR = 0.003;
  const optimizer = tf.train.adam(initialLR);
  model.compile({ optimizer, loss: 'meanSquaredError' });

  const xs = tf.tensor2d(normTrainX);
  const ys = tf.tensor2d(normTrainY.map((v) => [v]));
  const totalEpochs = 300;
  const lossHistory: number[] = [];
  const valLossHistory: number[] = [];
  let bestValLoss = Infinity;
  let bestEpoch = 0;
  let bestWeights: ArrayBuffer[] | null = null;

  await model.fit(xs, ys, {
    epochs: totalEpochs,
    batchSize: Math.min(32, Math.max(4, Math.floor(trainX.length / 4))),
    validationSplit: 0.1,
    verbose: 0,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        const loss = logs?.loss ?? 0;
        const valLoss = logs?.val_loss ?? loss;
        lossHistory.push(loss);
        valLossHistory.push(valLoss);

        // Learning rate scheduling: reduce by half every 100 epochs
        if ((epoch + 1) % 100 === 0) {
          const newLR = initialLR * Math.pow(0.5, Math.floor((epoch + 1) / 100));
          (optimizer as unknown as { learningRate: number }).learningRate = newLR;
        }

        onEpoch?.(epoch + 1, totalEpochs, loss, valLoss, lossHistory, valLossHistory);

        // Save best weights
        if (valLoss < bestValLoss) {
          bestValLoss = valLoss;
          bestEpoch = epoch + 1;
          // Save current weights
          bestWeights = await Promise.all(
            model.getWeights().map((w) => w.data().then((d) => new Float32Array(d).buffer as ArrayBuffer)),
          );
        }
      },
    },
  });

  // Restore best weights
  if (bestWeights) {
    const weights = bestWeights as ArrayBuffer[];
    const shapes = model.getWeights().map((w) => w.shape);
    const dtypes = model.getWeights().map((w) => w.dtype);
    const restored = weights.map((buf, i) => tf.tensor(new Float32Array(buf), shapes[i], dtypes[i] as 'float32'));
    model.setWeights(restored);
    restored.forEach((t) => t.dispose());
  }

  const testTensor = tf.tensor2d(normTestX);
  const predTensor = model.predict(testTensor) as tf.Tensor;
  const predictions = Array.from(predTensor.dataSync()).map((v) => Math.max(0, v * labelStd + labelMean));

  // Save MLP (with best weights) to indexeddb
  await model.save(MLP_MODEL_PATH);

  xs.dispose();
  ys.dispose();
  testTensor.dispose();
  predTensor.dispose();
  model.dispose();

  return {
    result: { name: '神经网络 (MLP)', predictions, r2: calcR2(testY, predictions), mae: calcMAE(testY, predictions) },
    labelMean,
    labelStd,
    trainingInfo: {
      totalEpochs,
      actualEpochs: lossHistory.length,
      bestEpoch,
      stoppedEarly: false,
      lossHistory: [...lossHistory],
      valLossHistory: [...valLossHistory],
    },
  };
}

// ── Ridge Regression ──

function trainRidge(
  trainX: number[][],
  trainY: number[],
  testX: number[][],
  testY: number[],
  featureNames: string[],
): { result: ModelResult; coefficients: number[] } {
  const d = trainX[0].length;
  const xs = Array.from({ length: d }, (_, j) => trainX.map((row) => row[j]));
  const reg = ridgeRegression(xs, trainY, 0.1);

  const predictions = testX.map((row) => {
    let pred = reg.coefficients[0];
    for (let j = 0; j < d; j++) pred += reg.coefficients[j + 1] * row[j];
    return Math.max(0, pred);
  });

  const importance = featureNames
    .map((name, j) => {
      const vals = trainX.map((row) => row[j]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      let std = 0;
      for (const v of vals) std += (v - mean) ** 2;
      std = Math.sqrt(std / vals.length) || 1;
      return { name, importance: Math.abs(reg.coefficients[j + 1]) * std };
    })
    .sort((a, b) => b.importance - a.importance);
  const totalImp = importance.reduce((s, i) => s + i.importance, 0);
  if (totalImp > 0)
    importance.forEach((i) => {
      i.importance = (i.importance / totalImp) * 100;
    });

  return {
    result: {
      name: '岭回归',
      predictions,
      r2: calcR2(testY, predictions),
      mae: calcMAE(testY, predictions),
      featureImportance: importance,
    },
    coefficients: reg.coefficients,
  };
}

// ── Train/Test Split ──

function splitData(rows: FeatureRow[], testRatio = 0.2) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const splitIdx = Math.floor(sorted.length * (1 - testRatio));
  return {
    trainX: sorted.slice(0, splitIdx).map((r) => r.features),
    trainY: sorted.slice(0, splitIdx).map((r) => r.label),
    testX: sorted.slice(splitIdx).map((r) => r.features),
    testY: sorted.slice(splitIdx).map((r) => r.label),
    testDates: sorted.slice(splitIdx).map((r) => r.date),
  };
}

// ── Train + Save ──

export type TrainingStep = {
  step: number;
  total: number;
  label: string;
  detail?: string;
  /** MLP training progress */
  mlpProgress?: {
    epoch: number;
    totalEpochs: number;
    loss: number;
    valLoss?: number;
    lossHistory: number[];
    valLossHistory: number[];
    bestEpoch?: number;
    stoppedEarly?: boolean;
  };
};

export async function trainEnsemble(
  rows: FeatureRow[],
  featureNames: string[],
  userId: string,
  onProgress?: (step: TrainingStep) => void,
): Promise<EnsembleResult | null> {
  if (rows.length < 10) return null;

  // Yield to let UI render between synchronous steps
  const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

  onProgress?.({
    step: 1,
    total: 6,
    label: '准备数据',
    detail: `共 ${rows.length} 条记录，按时间切分为训练集和测试集`,
  });
  await yieldUI();
  const { trainX, trainY, testX, testY, testDates } = splitData(rows);
  if (trainX.length < 5 || testX.length < 3) return null;

  const scaler = fitScaler(trainX);

  onProgress?.({
    step: 2,
    total: 6,
    label: '训练随机森林',
    detail: `使用 ${trainX.length} 条数据训练 200 棵决策树，请稍候...`,
  });
  await yieldUI();
  const { result: rfResult, model: rfModel } = trainRandomForest(trainX, trainY, testX, testY, featureNames);

  onProgress?.({ step: 3, total: 6, label: '训练岭回归', detail: '使用线性模型拟合特征与收益的关系' });
  await yieldUI();
  const { result: ridgeResult, coefficients: ridgeCoeffs } = trainRidge(trainX, trainY, testX, testY, featureNames);

  onProgress?.({
    step: 4,
    total: 6,
    label: '训练神经网络',
    detail: `训练 300 轮，完成后自动采用验证 loss 最低的轮次权重`,
  });
  await yieldUI();
  let mlpBestEpoch = 0;
  let mlpStoppedEarly = false;
  const {
    result: mlpResult,
    labelMean,
    labelStd,
    trainingInfo: mlpTrainingInfo,
  } = await trainMLP(
    trainX,
    trainY,
    testX,
    testY,
    scaler,
    (epoch, totalEpochs, loss, valLoss, lossHistory, valLossHistory) => {
      // Track best epoch from valLossHistory
      const vlh = valLossHistory ?? [];
      if (vlh.length > 0) {
        const minVal = Math.min(...vlh);
        mlpBestEpoch = vlh.indexOf(minVal) + 1;
      }
      mlpStoppedEarly = epoch < totalEpochs && (lossHistory?.length ?? 0) === epoch;

      onProgress?.({
        step: 4,
        total: 6,
        label: '训练神经网络',
        detail: `第 ${epoch}/${totalEpochs} 轮 · loss: ${loss.toFixed(4)}${valLoss !== undefined ? ` · val_loss: ${valLoss.toFixed(4)}` : ''}`,
        mlpProgress: {
          epoch,
          totalEpochs,
          loss,
          valLoss,
          lossHistory: lossHistory ?? [],
          valLossHistory: valLossHistory ?? [],
          bestEpoch: mlpBestEpoch,
        },
      });
    },
  );

  onProgress?.({ step: 5, total: 6, label: '计算集成权重', detail: '根据各模型表现分配权重，合并预测结果' });

  const models = [rfResult, ridgeResult, mlpResult];

  const invMAEs = models.map((m) => 1 / (m.mae + 0.01));
  const totalInvMAE = invMAEs.reduce((a, b) => a + b, 0);
  const weights = invMAEs.map((v) => v / totalInvMAE);

  const ensemblePred = testY.map((_, i) => {
    let pred = 0;
    for (let m = 0; m < models.length; m++) pred += weights[m] * models[m].predictions[i];
    return Math.max(0, pred);
  });

  const ensembleResult: EnsembleResult = {
    models,
    ensemble: {
      predictions: ensemblePred,
      r2: calcR2(testY, ensemblePred),
      mae: calcMAE(testY, ensemblePred),
      weights: models.map((m, i) => ({ name: m.name, weight: weights[i] })),
    },
    testActual: testY,
    testDates,
    featureNames,
    trainedAt: Date.now(),
    dataCount: rows.length,
    trainCount: trainX.length,
    testCount: testX.length,
    mlpTrainingInfo,
  };

  onProgress?.({ step: 6, total: 6, label: '保存模型', detail: '将训练好的模型保存到本地，下次打开自动加载' });

  // Save to IndexedDB
  const savedModel: SavedMLModel = {
    userId,
    trainedAt: Date.now(),
    dataCount: rows.length,
    rfJson: JSON.stringify(rfModel.toJSON()),
    ridgeCoefficients: ridgeCoeffs,
    scaler,
    labelScaler: { mean: labelMean, std: labelStd },
    ensembleWeights: weights,
    evaluationResult: ensembleResult,
  };
  await db.mlModels.put(savedModel);

  return ensembleResult;
}

// ── Load saved model ──

export async function loadSavedModel(userId: string): Promise<{
  ensembleResult: EnsembleResult;
  savedAt: number;
  dataCount: number;
} | null> {
  const saved = await db.mlModels.get(userId);
  if (!saved) return null;

  const ensembleResult = parseEvaluationResult(saved.evaluationResult);
  if (!ensembleResult) {
    return null;
  }

  return {
    ensembleResult,
    savedAt: saved.trainedAt,
    dataCount: saved.dataCount,
  };
}

// ── Predict with saved model ──

export async function predictWithSavedModel(userId: string, features: number[][]): Promise<number[] | null> {
  const saved = await db.mlModels.get(userId);
  if (!saved) return null;

  try {
    // Load Random Forest
    const rfModel = RandomForestRegression.load(JSON.parse(saved.rfJson));
    const rfPred = rfModel.predict(features) as number[];

    // Load Ridge
    const ridgePred = features.map((row) => {
      let pred = saved.ridgeCoefficients[0];
      for (let j = 0; j < row.length; j++) pred += saved.ridgeCoefficients[j + 1] * row[j];
      return Math.max(0, pred);
    });

    // Load MLP
    let mlpPred: number[];
    try {
      const mlpModel = await tf.loadLayersModel(MLP_MODEL_PATH);
      const normFeatures = transformFeatures(features, saved.scaler);
      const tensor = tf.tensor2d(normFeatures);
      const predTensor = mlpModel.predict(tensor) as tf.Tensor;
      mlpPred = Array.from(predTensor.dataSync()).map((v) =>
        Math.max(0, v * saved.labelScaler.std + saved.labelScaler.mean),
      );
      tensor.dispose();
      predTensor.dispose();
      mlpModel.dispose();
    } catch {
      // MLP failed to load, use average of other two
      mlpPred = rfPred.map((v, i) => (v + ridgePred[i]) / 2);
    }

    // Ensemble
    const w = saved.ensembleWeights;
    return features.map((_, i) => Math.max(0, w[0] * rfPred[i] + w[1] * ridgePred[i] + w[2] * mlpPred[i]));
  } catch {
    return null;
  }
}
