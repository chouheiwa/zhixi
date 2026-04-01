import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { isEvaluationResult, loadSavedModel, type EnsembleResult } from '@/shared/ml-models';

const USER_ID = 'ml-user';

const makeEnsembleResult = (): EnsembleResult => ({
  models: [
    {
      name: '随机森林',
      predictions: [1, 2],
      r2: 0.8,
      mae: 0.3,
      featureImportance: [{ name: 'pv', importance: 60 }],
    },
  ],
  ensemble: {
    predictions: [1.1, 2.1],
    r2: 0.82,
    mae: 0.28,
    weights: [{ name: '随机森林', weight: 1 }],
  },
  testActual: [1, 2],
  testDates: ['2026-03-01', '2026-03-02'],
  featureNames: ['pv'],
  trainedAt: 1_711_111_111_111,
  dataCount: 12,
  trainCount: 9,
  testCount: 3,
  mlpTrainingInfo: {
    totalEpochs: 10,
    actualEpochs: 10,
    bestEpoch: 8,
    stoppedEarly: false,
    lossHistory: [0.5, 0.4],
    valLossHistory: [0.6, 0.45],
  },
});

beforeEach(async () => {
  await db.mlModels.clear();
});

describe('isEvaluationResult', () => {
  it('accepts a valid ensemble evaluation result object', () => {
    expect(isEvaluationResult(makeEnsembleResult())).toBe(true);
  });

  it('rejects invalid shapes', () => {
    expect(isEvaluationResult(null)).toBe(false);
    expect(isEvaluationResult({ r2: 0.9, mape: 10 })).toBe(false);
    expect(isEvaluationResult({ models: [], ensemble: null })).toBe(false);
  });
});

describe('loadSavedModel', () => {
  it('loads object-based evaluation results directly', async () => {
    const evaluationResult = makeEnsembleResult();

    await db.mlModels.put({
      userId: USER_ID,
      trainedAt: evaluationResult.trainedAt,
      dataCount: evaluationResult.dataCount,
      rfJson: '{}',
      ridgeCoefficients: [0, 1],
      scaler: { means: [0], stds: [1] },
      labelScaler: { mean: 0, std: 1 },
      ensembleWeights: [1],
      evaluationResult,
    });

    await expect(loadSavedModel(USER_ID)).resolves.toEqual({
      ensembleResult: evaluationResult,
      savedAt: evaluationResult.trainedAt,
      dataCount: evaluationResult.dataCount,
    });
  });

  it('loads legacy stringified evaluation results', async () => {
    const evaluationResult = makeEnsembleResult();

    await db.mlModels.put({
      userId: USER_ID,
      trainedAt: evaluationResult.trainedAt,
      dataCount: evaluationResult.dataCount,
      rfJson: '{}',
      ridgeCoefficients: [0, 1],
      scaler: { means: [0], stds: [1] },
      labelScaler: { mean: 0, std: 1 },
      ensembleWeights: [1],
      evaluationResult: JSON.stringify(evaluationResult),
    });

    await expect(loadSavedModel(USER_ID)).resolves.toEqual({
      ensembleResult: evaluationResult,
      savedAt: evaluationResult.trainedAt,
      dataCount: evaluationResult.dataCount,
    });
  });
});
