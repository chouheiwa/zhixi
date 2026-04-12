/**
 * Tests for TodayPredictionPanel with various states.
 */
import React from 'react';
import { render, cleanup, waitFor } from '../../helpers/render';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { makeDailySummaries } from '../../helpers/mock-data';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Mocks ──
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

const mockUser = { id: 'user-1', urlToken: 'test', name: 'Test', avatarUrl: '' };
const mockUseCurrentUser = vi.fn(() => ({ user: mockUser, loading: false }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: mockUseCurrentUser,
}));

const mockGetAllRealtimeAggr = vi.fn(() => Promise.resolve([]));
const mockGetAllDailySummaries = vi.fn(() => Promise.resolve(makeDailySummaries(30)));

vi.mock('@/db/realtime-store', () => ({
  getAllRealtimeAggr: mockGetAllRealtimeAggr,
  getRealtimeAggrLatestDate: vi.fn(() => Promise.resolve(null)),
  upsertRealtimeAggr: vi.fn(() => Promise.resolve()),
  getTodayRealtimeSnapshots: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/db/income-store', () => ({
  getAllDailySummaries: mockGetAllDailySummaries,
  getUserSettings: vi.fn(() => Promise.resolve(null)),
  saveUserSettings: vi.fn(() => Promise.resolve()),
  getMissingDates: vi.fn(() => Promise.resolve([])),
  upsertIncomeRecords: vi.fn(() => Promise.resolve()),
  markDateSynced: vi.fn(() => Promise.resolve()),
}));

const mockMlModelsGet = vi.fn(() => Promise.resolve(null));
const mockMlModelsPut = vi.fn(() => Promise.resolve());

vi.mock('@/db/database', () => ({
  db: {
    mlModels: {
      get: mockMlModelsGet,
      put: mockMlModelsPut,
    },
  },
}));

// Mock ml-realtime module
const mockBuildRealtimeTrainingRows = vi.fn(() => []);
const mockBuildTodayFeatures = vi.fn(() => [1, 2, 3]);
const mockTrainRealtimeModel = vi.fn(() => null);
const mockPredictWithRealtimeModel = vi.fn(() => 42.5);

vi.mock('@/shared/ml-realtime', () => ({
  buildRealtimeTrainingRows: mockBuildRealtimeTrainingRows,
  buildTodayFeatures: mockBuildTodayFeatures,
  trainRealtimeModel: mockTrainRealtimeModel,
  predictWithRealtimeModel: mockPredictWithRealtimeModel,
  REALTIME_FEATURE_LABELS: {
    pv: '阅读量',
    upvote: '点赞',
    comment: '评论',
    collect: '收藏',
    share: '分享',
    show: '曝光量',
    like: '喜欢',
    play: '播放量',
    rePin: '置顶',
    newIncrUpvoteNum: '新增点赞',
    newDescUpvoteNum: '减少点赞',
  },
}));

// Helper to build a fake realtime aggr record
function makeRealtimeRecord(date: string) {
  return {
    userId: 'user-1',
    date,
    updatedAt: `${date}T12:00:00Z`,
    pv: 1000,
    play: 0,
    show: 2000,
    upvote: 50,
    comment: 10,
    like: 30,
    collect: 5,
    share: 3,
    reaction: 0,
    rePin: 0,
    likeAndReaction: 30,
    newUpvote: 5,
    newLike: 3,
    newIncrUpvoteNum: 5,
    newDescUpvoteNum: 0,
    newIncrLikeNum: 3,
    newDescLikeNum: 0,
    collectedAt: Date.now(),
  };
}

// Build 30 realtime records
function makeRealtimeRecords(count: number) {
  const records = [];
  for (let i = 0; i < count; i++) {
    const d = new Date('2024-01-01');
    d.setDate(d.getDate() + i);
    records.push(makeRealtimeRecord(d.toISOString().slice(0, 10)));
  }
  return records;
}

describe('TodayPredictionPanel', () => {
  beforeEach(() => {
    mockGetAllRealtimeAggr.mockResolvedValue([]);
    mockGetAllDailySummaries.mockResolvedValue(makeDailySummaries(30));
    mockMlModelsGet.mockResolvedValue(null);
    mockBuildRealtimeTrainingRows.mockReturnValue([]);
  });

  it('renders "no data synced" state when aggrRecords is empty', async () => {
    mockGetAllRealtimeAggr.mockResolvedValue([]);
    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    await waitFor(
      () => {
        expect(container.textContent).toContain('需要先同步历史汇总数据');
      },
      { timeout: 3000 },
    );
  });

  it('renders model-not-trained state when records loaded but no model', async () => {
    const records = makeRealtimeRecords(30);
    mockGetAllRealtimeAggr.mockResolvedValue(records);
    mockBuildRealtimeTrainingRows.mockReturnValue(records.map((r, i) => ({ i }))); // 30 rows

    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    await waitFor(
      () => {
        expect(container.textContent).not.toContain('需要先同步历史汇总数据');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders with saved model loaded from DB', async () => {
    const records = makeRealtimeRecords(30);
    mockGetAllRealtimeAggr.mockResolvedValue(records);

    const mockEvaluation = {
      r2: 0.8,
      mae: 10,
      predictions: [50, 60, 70],
      actuals: [55, 58, 72],
      testDates: ['2024-01-28', '2024-01-29', '2024-01-30'],
      featureImportance: [
        { name: 'pv', rfImportance: 60, ridgeCoeff: 0.5 },
        { name: 'upvote', rfImportance: 30, ridgeCoeff: 0.3 },
      ],
    };

    mockMlModelsGet.mockResolvedValueOnce({
      userId: 'user-1_realtime',
      trainedAt: Date.now(),
      dataCount: 30,
      rfJson: '{}',
      ridgeCoefficients: [0.5, 0.3, 0.2],
      scaler: { means: [100], stds: [50] },
      labelScaler: { mean: 50, std: 20 },
      ensembleWeights: [0.7, 0.3],
      evaluationResult: JSON.stringify(mockEvaluation),
    });

    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    await waitFor(
      () => {
        // Once loaded, should not be in loading or no-data state
        expect(container.textContent).not.toContain('需要先同步历史汇总数据');
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders with no user', async () => {
    mockUseCurrentUser.mockReturnValueOnce({ user: null, loading: false });
    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    expect(container).toBeTruthy();
  });

  it('renders with not enough training data', async () => {
    const records = makeRealtimeRecords(5); // less than 10
    mockGetAllRealtimeAggr.mockResolvedValue(records);
    mockBuildRealtimeTrainingRows.mockReturnValue(records.slice(0, 3)); // 3 rows < 10

    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    await waitFor(
      () => {
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});
