/**
 * Extended tests for ml-models.ts covering predictWithSavedModel, trainEnsemble,
 * and internal helper functions (calcR2, calcMAE, splitData, trainRidge).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/database';

// Mock TensorFlow.js - must be before importing ml-models
vi.mock('@tensorflow/tfjs', () => {
  const mockModel = {
    add: vi.fn(),
    compile: vi.fn(),
    fit: vi.fn(() =>
      Promise.resolve({
        history: { loss: [0.5, 0.4, 0.3], val_loss: [0.6, 0.5, 0.4] },
      }),
    ),
    predict: vi.fn(() => ({
      dataSync: vi.fn(() => new Float32Array([1.0, 1.5, 2.0])),
      dispose: vi.fn(),
    })),
    getWeights: vi.fn(() => [
      {
        shape: [4, 128],
        dtype: 'float32',
        data: vi.fn(() => Promise.resolve(new Float32Array(512))),
        dispose: vi.fn(),
      },
    ]),
    setWeights: vi.fn(),
    save: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(),
  };

  const mockLoadedModel = {
    predict: vi.fn(() => ({
      dataSync: vi.fn(() => new Float32Array([1.0, 1.5])),
      dispose: vi.fn(),
    })),
    dispose: vi.fn(),
  };

  return {
    sequential: vi.fn(() => mockModel),
    layers: {
      dense: vi.fn(() => ({})),
      batchNormalization: vi.fn(() => ({})),
      activation: vi.fn(() => ({})),
      dropout: vi.fn(() => ({})),
    },
    train: {
      adam: vi.fn(() => ({ learningRate: 0.003 })),
    },
    tensor2d: vi.fn(() => ({
      dispose: vi.fn(),
    })),
    tensor: vi.fn((data: Float32Array, shape: number[], dtype: string) => ({
      shape,
      dtype,
      dispose: vi.fn(),
    })),
    loadLayersModel: vi.fn(() => Promise.resolve(mockLoadedModel)),
  };
});

// Mock ml-random-forest
vi.mock('ml-random-forest', () => {
  const mockRF = {
    train: vi.fn(),
    predict: vi.fn((X: number[][]) => X.map(() => 100)),
    toJSON: vi.fn(() => ({ type: 'RF', n: 200 })),
  };
  return {
    RandomForestRegression: Object.assign(
      vi.fn(() => mockRF),
      {
        load: vi.fn(() => mockRF),
      },
    ),
  };
});

const USER_ID = 'ml-extended-user';

function makeSavedModel() {
  return {
    userId: USER_ID,
    trainedAt: Date.now(),
    dataCount: 30,
    rfJson: JSON.stringify({ type: 'RF', n: 200 }),
    ridgeCoefficients: [10, 0.5, 0.3, 0.1],
    scaler: { means: [0, 0, 0], stds: [1, 1, 1] },
    labelScaler: { mean: 100, std: 50 },
    ensembleWeights: [0.4, 0.3, 0.3],
    evaluationResult: {
      models: [
        {
          name: '随机森林',
          predictions: [100, 150, 200],
          r2: 0.8,
          mae: 20,
          featureImportance: [{ name: 'pv', importance: 60 }],
        },
        {
          name: '岭回归',
          predictions: [110, 140, 190],
          r2: 0.75,
          mae: 25,
          featureImportance: [{ name: 'pv', importance: 55 }],
        },
        {
          name: '神经网络 (MLP)',
          predictions: [105, 145, 195],
          r2: 0.78,
          mae: 22,
        },
      ],
      ensemble: {
        predictions: [105, 145, 195],
        r2: 0.82,
        mae: 18,
        weights: [
          { name: '随机森林', weight: 0.4 },
          { name: '岭回归', weight: 0.3 },
          { name: '神经网络 (MLP)', weight: 0.3 },
        ],
      },
      testActual: [100, 150, 200],
      testDates: ['2024-01-28', '2024-01-29', '2024-01-30'],
      featureNames: ['pv', 'upvote', 'comment'],
      trainedAt: Date.now(),
      dataCount: 30,
      trainCount: 24,
      testCount: 6,
    },
  };
}

beforeEach(async () => {
  await db.mlModels.clear();
});

describe('predictWithSavedModel', () => {
  it('returns null when no model saved', async () => {
    const { predictWithSavedModel } = await import('@/shared/ml-models');
    const result = await predictWithSavedModel('nonexistent-user', [[1, 2, 3]]);
    expect(result).toBeNull();
  });

  it('returns predictions when model exists', async () => {
    const { predictWithSavedModel } = await import('@/shared/ml-models');
    await db.mlModels.put(makeSavedModel());

    const features = [
      [100, 5, 2],
      [200, 10, 4],
    ];
    const result = await predictWithSavedModel(USER_ID, features);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    if (result) {
      expect(result.length).toBe(features.length);
      result.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    }
  });

  it('handles MLP load failure gracefully', async () => {
    const tf = await import('@tensorflow/tfjs');
    vi.mocked(tf.loadLayersModel).mockRejectedValueOnce(new Error('MLP not found'));

    const { predictWithSavedModel } = await import('@/shared/ml-models');
    await db.mlModels.put(makeSavedModel());

    const features = [[100, 5, 2]];
    const result = await predictWithSavedModel(USER_ID, features);
    // Should fall back to average of RF and Ridge
    expect(result).not.toBeNull();
    if (result) {
      expect(result.length).toBe(1);
    }
  });
});

describe('trainEnsemble', () => {
  it('returns null when rows < 10', async () => {
    const { trainEnsemble } = await import('@/shared/ml-models');
    const rows = Array.from({ length: 9 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      features: [i * 10, i * 2, i],
      label: i * 5,
    }));
    const result = await trainEnsemble(rows, ['pv', 'upvote', 'comment'], USER_ID);
    expect(result).toBeNull();
  });

  it('returns null when train/test split too small', async () => {
    const { trainEnsemble } = await import('@/shared/ml-models');
    // 10 rows, 80% train = 8 rows, 20% test = 2 rows => testX < 3 => returns null
    const rows = Array.from({ length: 10 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      features: [i * 10, i * 2, i],
      label: i * 50 + 100,
    }));
    const result = await trainEnsemble(rows, ['pv', 'upvote', 'comment'], USER_ID);
    expect(result).toBeNull();
  });

  it('trains with sufficient data and calls progress callback', async () => {
    const { trainEnsemble } = await import('@/shared/ml-models');
    // 20 rows => 80% = 16 train, 20% = 4 test => trainX >= 5, testX >= 3 ... wait 4 < 3? No, 4 >= 3
    // Actually 20 * 0.8 = 16 train, 20 * 0.2 = 4 test. trainX=16 >= 5, testX=4 >= 3 ✓
    const rows = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      features: [i * 100 + 50, i * 10 + 5, i * 3 + 1, i * 2],
      label: i * 100 + 200,
    }));

    const progressSteps: string[] = [];
    const onProgress = vi.fn((step: { label: string }) => {
      progressSteps.push(step.label);
    });

    const result = await trainEnsemble(rows, ['pv', 'upvote', 'comment', 'share'], USER_ID, onProgress);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.models.length).toBeGreaterThan(0);
      expect(result.ensemble).toBeDefined();
      expect(result.featureNames).toEqual(['pv', 'upvote', 'comment', 'share']);
      expect(result.dataCount).toBe(20);
    }
    expect(onProgress).toHaveBeenCalled();
    expect(progressSteps).toContain('准备数据');
  });

  it('trains and saves to DB when successful', async () => {
    const { trainEnsemble } = await import('@/shared/ml-models');
    const rows = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-02-${String(i + 1).padStart(2, '0')}`,
      features: [i * 100 + 50, i * 10 + 5, i * 3 + 1],
      label: i * 100 + 200,
    }));

    const result = await trainEnsemble(rows, ['pv', 'upvote', 'comment'], USER_ID);
    expect(result).not.toBeNull();

    // Verify model was saved to DB
    const saved = await db.mlModels.get(USER_ID);
    expect(saved).not.toBeNull();
    expect(saved?.dataCount).toBe(20);
  });
});

describe('isEvaluationResult - extended edge cases', () => {
  it('rejects invalid models array', async () => {
    const { isEvaluationResult } = await import('@/shared/ml-models');
    expect(
      isEvaluationResult({
        models: [{ name: 'bad', predictions: 'not_array', r2: 0.5, mae: 10 }],
        ensemble: {
          predictions: [1],
          r2: 0.5,
          mae: 10,
          weights: [{ name: 'x', weight: 1 }],
        },
        testActual: [1],
        testDates: ['2024-01-01'],
        featureNames: ['pv'],
        trainedAt: 1234,
        dataCount: 10,
        trainCount: 8,
        testCount: 2,
      }),
    ).toBe(false);
  });

  it('rejects when ensemble fields missing', async () => {
    const { isEvaluationResult } = await import('@/shared/ml-models');
    expect(
      isEvaluationResult({
        models: [],
        ensemble: {
          predictions: [1],
          r2: 'not_number',
          mae: 10,
          weights: [],
        },
        testActual: [1],
        testDates: ['2024-01-01'],
        featureNames: ['pv'],
        trainedAt: 1234,
        dataCount: 10,
        trainCount: 8,
        testCount: 2,
      }),
    ).toBe(false);
  });

  it('accepts valid result with mlpTrainingInfo', async () => {
    const { isEvaluationResult } = await import('@/shared/ml-models');
    expect(
      isEvaluationResult({
        models: [
          {
            name: 'RF',
            predictions: [1, 2],
            r2: 0.8,
            mae: 10,
            featureImportance: [{ name: 'pv', importance: 60 }],
          },
        ],
        ensemble: {
          predictions: [1, 2],
          r2: 0.82,
          mae: 9,
          weights: [{ name: 'RF', weight: 1 }],
        },
        testActual: [1, 2],
        testDates: ['2024-01-01', '2024-01-02'],
        featureNames: ['pv'],
        trainedAt: 1234567890,
        dataCount: 15,
        trainCount: 12,
        testCount: 3,
        mlpTrainingInfo: {
          totalEpochs: 300,
          actualEpochs: 300,
          bestEpoch: 250,
          stoppedEarly: false,
          lossHistory: [0.5, 0.4],
          valLossHistory: [0.6, 0.45],
        },
      }),
    ).toBe(true);
  });

  it('rejects when mlpTrainingInfo is invalid', async () => {
    const { isEvaluationResult } = await import('@/shared/ml-models');
    expect(
      isEvaluationResult({
        models: [],
        ensemble: {
          predictions: [1],
          r2: 0.5,
          mae: 10,
          weights: [],
        },
        testActual: [1],
        testDates: ['2024-01-01'],
        featureNames: ['pv'],
        trainedAt: 1234,
        dataCount: 10,
        trainCount: 8,
        testCount: 2,
        mlpTrainingInfo: {
          totalEpochs: 'not_number',
          actualEpochs: 10,
          bestEpoch: 8,
          stoppedEarly: false,
          lossHistory: [0.5],
          valLossHistory: [0.6],
        },
      }),
    ).toBe(false);
  });

  it('rejects when testDates contains non-string', async () => {
    const { isEvaluationResult } = await import('@/shared/ml-models');
    expect(
      isEvaluationResult({
        models: [],
        ensemble: {
          predictions: [1],
          r2: 0.5,
          mae: 10,
          weights: [],
        },
        testActual: [1],
        testDates: [123],
        featureNames: ['pv'],
        trainedAt: 1234,
        dataCount: 10,
        trainCount: 8,
        testCount: 2,
      }),
    ).toBe(false);
  });
});

describe('loadSavedModel - edge cases', () => {
  it('returns null when evaluationResult is invalid JSON string', async () => {
    const { loadSavedModel } = await import('@/shared/ml-models');

    await db.mlModels.put({
      userId: USER_ID,
      trainedAt: Date.now(),
      dataCount: 10,
      rfJson: '{}',
      ridgeCoefficients: [0, 1],
      scaler: { means: [0], stds: [1] },
      labelScaler: { mean: 0, std: 1 },
      ensembleWeights: [1],
      evaluationResult: 'invalid-json{{{',
    });

    const result = await loadSavedModel(USER_ID);
    expect(result).toBeNull();
  });

  it('returns null when evaluationResult is neither string nor EvaluationResult', async () => {
    const { loadSavedModel } = await import('@/shared/ml-models');

    await db.mlModels.put({
      userId: USER_ID,
      trainedAt: Date.now(),
      dataCount: 10,
      rfJson: '{}',
      ridgeCoefficients: [0, 1],
      scaler: { means: [0], stds: [1] },
      labelScaler: { mean: 0, std: 1 },
      ensembleWeights: [1],
      evaluationResult: 42 as unknown as string,
    });

    const result = await loadSavedModel(USER_ID);
    expect(result).toBeNull();
  });

  it('returns null when no model found', async () => {
    const { loadSavedModel } = await import('@/shared/ml-models');
    const result = await loadSavedModel('no-such-user');
    expect(result).toBeNull();
  });
});
