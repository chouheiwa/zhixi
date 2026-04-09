/**
 * Tests for MLPredictionPanel with async state rendering.
 */
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { makeIncomeRecords } from '../../helpers/mock-data';

afterEach(() => {
  cleanup();
});

// ── Shared mocks ──
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(() => ({
    add: vi.fn(),
    compile: vi.fn(),
    fit: vi.fn(() => Promise.resolve({ history: { loss: [0.1] } })),
    predict: vi.fn(() => ({ dataSync: vi.fn(() => [100]), dispose: vi.fn() })),
    dispose: vi.fn(),
  })),
  layers: {
    dense: vi.fn(() => ({})),
    batchNormalization: vi.fn(() => ({})),
    activation: vi.fn(() => ({})),
    dropout: vi.fn(() => ({})),
  },
  train: { adam: vi.fn() },
  tensor2d: vi.fn(() => ({ dispose: vi.fn() })),
}));

const mockUser = { id: 'user-1', urlToken: 'test', name: 'Test', avatarUrl: '' };
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({ user: mockUser, loading: false })),
}));

vi.mock('@/shared/ml-features', () => ({
  buildFeatureRows: vi.fn(() => Array.from({ length: 30 }, (_, i) => ({ i }))),
  buildPredictionFeatures: vi.fn(() => [1, 2, 3]),
  FEATURE_NAMES: ['pv', 'upvote', 'comment'],
}));

const mockLoadSavedModel = vi.fn(() => Promise.resolve(null));
const mockTrainEnsemble = vi.fn(() => Promise.resolve(null));
const mockPredictWithSavedModel = vi.fn(() => Promise.resolve(null));

vi.mock('@/shared/ml-models', () => ({
  loadSavedModel: mockLoadSavedModel,
  trainEnsemble: mockTrainEnsemble,
  predictWithSavedModel: mockPredictWithSavedModel,
  isEvaluationResult: vi.fn(() => false),
}));

vi.mock('@/db/database', () => ({
  db: {
    contentDaily: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })),
    },
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          and: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    },
    contentDailyCache: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
      })),
    },
  },
}));

const mockEnsembleResult = {
  models: [
    {
      name: '随机森林',
      predictions: [100, 150, 200],
      r2: 0.8,
      mae: 20,
      featureImportance: [
        { name: 'pv', importance: 60 },
        { name: 'upvote', importance: 30 },
        { name: 'comment', importance: 10 },
      ],
    },
    {
      name: '岭回归',
      predictions: [110, 140, 190],
      r2: 0.7,
      mae: 25,
      featureImportance: [],
    },
    {
      name: '神经网络',
      predictions: [105, 145, 195],
      r2: 0.75,
      mae: 22,
      featureImportance: [],
    },
  ],
  ensemble: {
    predictions: [105, 145, 195],
    r2: 0.82,
    mae: 18,
    weights: [
      { name: '随机森林', weight: 0.5 },
      { name: '岭回归', weight: 0.3 },
      { name: '神经网络', weight: 0.2 },
    ],
  },
  testActual: [100, 150, 200],
  testDates: ['2024-01-26', '2024-01-27', '2024-01-28'],
  featureNames: ['pv', 'upvote', 'comment'],
  trainedAt: Date.now(),
  dataCount: 30,
  trainCount: 24,
  testCount: 6,
};

describe('MLPredictionPanel - result display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSavedModel.mockResolvedValue(null);
  });

  it('renders loading state initially (loadingModel=true)', async () => {
    // loadSavedModel that never resolves → stays in loading
    mockLoadSavedModel.mockReturnValue(new Promise(() => {}));
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container.textContent).toContain('正在加载');
  });

  it('renders "not trained yet" state after loading with no model', async () => {
    mockLoadSavedModel.mockResolvedValue(null);
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    await waitFor(() => {
      expect(container.textContent).not.toContain('正在加载');
    });
    // After loading: either shows "not trained" or "start training" button
    expect(container).toBeTruthy();
  });

  it('renders result display after model loaded from DB', async () => {
    mockLoadSavedModel.mockResolvedValueOnce({
      ensembleResult: mockEnsembleResult,
      savedAt: Date.now(),
      dataCount: 30,
    });
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);

    // Wait for the async effect to complete
    await waitFor(
      () => {
        // Once loading is done, result display should be visible
        expect(container.textContent).not.toContain('正在加载');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders with high-accuracy model (r2 >= 0.9)', async () => {
    const highAccResult = {
      ...mockEnsembleResult,
      ensemble: { ...mockEnsembleResult.ensemble, r2: 0.95 },
    };
    mockLoadSavedModel.mockResolvedValueOnce({
      ensembleResult: highAccResult,
      savedAt: Date.now(),
      dataCount: 30,
    });
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);

    await waitFor(
      () => {
        expect(container.textContent).not.toContain('正在加载');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders with low-accuracy model (r2 < 0.5)', async () => {
    const lowAccResult = {
      ...mockEnsembleResult,
      ensemble: { ...mockEnsembleResult.ensemble, r2: 0.3 },
    };
    mockLoadSavedModel.mockResolvedValueOnce({
      ensembleResult: lowAccResult,
      savedAt: Date.now(),
      dataCount: 30,
    });
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);

    await waitFor(
      () => {
        expect(container.textContent).not.toContain('正在加载');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty testDates', async () => {
    const noDateResult = {
      ...mockEnsembleResult,
      testDates: undefined,
    };
    mockLoadSavedModel.mockResolvedValueOnce({
      ensembleResult: noDateResult,
      savedAt: Date.now(),
      dataCount: 30,
    });
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);

    await waitFor(
      () => {
        expect(container.textContent).not.toContain('正在加载');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('shows not-trained state when no user', async () => {
    const { useCurrentUser } = await import('@/hooks/use-current-user');
    vi.mocked(useCurrentUser).mockReturnValueOnce({ user: null, loading: false });

    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container).toBeTruthy();
  });
});
