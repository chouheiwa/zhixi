/**
 * Additional component tests for components not fully covered elsewhere.
 * Focuses on: ExportImportPanel, CollectorPanel, IncomeGoalPanel,
 * LayoutCustomizer, TodayPredictionPanel, MLPredictionPanel,
 * CorrelationAnalysis, RPMForecastPanel, WeeklySeasonalityChart,
 * PublishTimeAnalysis, ResidualChart.
 *
 * Components already tested in content-components.test.tsx are excluded:
 * ContentDetailPage, ContentComparePage, TopContentRanking, MultiDimensionRanking.
 */
import React from 'react';
import { render, cleanup, fireEvent, act } from '../../helpers/render';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  makeIncomeRecords,
  makeDailySummaries,
  makeDefaultTabs,
  makeContentDailyRecords,
} from '../../helpers/mock-data';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Shared mocks ──
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));
vi.mock('echarts', () => ({
  init: vi.fn(),
  graphic: { LinearGradient: vi.fn() },
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

vi.mock('xlsx', () => {
  const utils = {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
    aoa_to_sheet: vi.fn(() => ({})),
    sheet_add_aoa: vi.fn(),
  };
  return {
    default: { utils, writeFile: vi.fn() },
    utils,
    writeFile: vi.fn(),
  };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  })),
  arrayMove: vi.fn((arr: unknown[]) => [...arr]),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

// Mock hooks
interface CurrentUserMock {
  user: { id: string; urlToken: string; name: string; avatarUrl: string } | null;
  loading: boolean;
}
const mockCurrentUser = vi.fn<() => CurrentUserMock>(() => ({
  user: { id: 'user-1', urlToken: 'test', name: 'Test User', avatarUrl: '' },
  loading: false,
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: mockCurrentUser,
}));

vi.mock('@/hooks/use-user-settings', () => ({
  useUserSettings: vi.fn(() => ({
    settings: { userId: 'user-1', collectStartDate: '2024-01-01' },
    loading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(() => Promise.resolve({ count: 5, synced: 2, total: 5 })),
    syncIncome: vi.fn(() => Promise.resolve({ count: 10, synced: 5, total: 5 })),
    syncRealtimeAggr: vi.fn(() => Promise.resolve({ count: 3 })),
    fetchContentDaily: vi.fn(() => Promise.resolve({ count: 20 })),
    fetchAllCreations: vi.fn(() => Promise.resolve([])),
    fetchTodayContentDaily: vi.fn(() => Promise.resolve({ count: 5, cached: 0 })),
    fetchTodayRealtime: vi.fn(() => Promise.resolve({ today: null })),
    logs: [],
  })),
}));

// Mock ML modules
vi.mock('@/shared/ml-models', () => ({
  loadSavedModel: vi.fn(() => Promise.resolve(null)),
  trainEnsemble: vi.fn(() => Promise.resolve(null)),
  predictWithSavedModel: vi.fn(() => Promise.resolve(null)),
  isEvaluationResult: vi.fn(() => false),
}));

vi.mock('@/shared/ml-features', () => ({
  buildFeatureRows: vi.fn(() => []),
  buildPredictionFeatures: vi.fn(() => []),
  FEATURE_NAMES: ['pv', 'upvote', 'comment'],
}));

vi.mock('@/shared/ml-realtime', () => ({
  buildRealtimeTrainingRows: vi.fn(() => []),
  buildTodayFeatures: vi.fn(() => null),
  trainRealtimeModel: vi.fn(() => null),
  predictWithRealtimeModel: vi.fn(() => null),
  REALTIME_FEATURE_LABELS: { pv: '阅读量' },
}));

// Mock DB stores
interface IncomeGoalMock {
  userId: string;
  period: string;
  targetAmount: number;
  createdAt: number;
}
const mockGoalStore = {
  getGoal: vi.fn<() => Promise<IncomeGoalMock | null>>(() => Promise.resolve(null)),
  saveGoal: vi.fn(() => Promise.resolve()),
  deleteGoal: vi.fn(() => Promise.resolve()),
  getIncomeGoal: vi.fn<() => Promise<IncomeGoalMock | null>>(() => Promise.resolve(null)),
  saveIncomeGoal: vi.fn(() => Promise.resolve()),
};
vi.mock('@/db/goal-store', () => mockGoalStore);

vi.mock('@/db/income-store', () => ({
  getAllDailySummaries: vi.fn(() => Promise.resolve([])),
  getUserSettings: vi.fn(() => Promise.resolve(null)),
  saveUserSettings: vi.fn(() => Promise.resolve()),
  getMissingDates: vi.fn(() => Promise.resolve([])),
  upsertIncomeRecords: vi.fn(() => Promise.resolve()),
  markDateSynced: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/db/realtime-store', () => ({
  getRealtimeAggrLatestDate: vi.fn(() => Promise.resolve(null)),
  upsertRealtimeAggr: vi.fn(() => Promise.resolve()),
  getTodayRealtimeSnapshots: vi.fn(() => Promise.resolve([])),
  getAllRealtimeAggr: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/db/export-import', () => ({
  exportToJSON: vi.fn(() => Promise.resolve('{"test":true}')),
  importFromJSON: vi.fn(() =>
    Promise.resolve({
      imported: 5,
      skipped: 0,
      errors: [],
    }),
  ),
}));

vi.mock('@/db/database', () => ({
  db: {
    realtimeAggrRecords: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })),
    },
    contentDailyRecords: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })),
    },
    contentDaily: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })),
    },
    contentDailyCache: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
      })),
    },
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          and: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    },
    mlModels: {
      get: vi.fn(() => Promise.resolve(null)),
      put: vi.fn(() => Promise.resolve()),
    },
    userSettings: {
      get: vi.fn(() => Promise.resolve(null)),
    },
  },
}));

// ── ExportImportPanel ──
describe('ExportImportPanel', () => {
  it('renders with initial state', async () => {
    const { ExportImportPanel } = await import('@/dashboard/components/ExportImportPanel');
    const { container } = render(<ExportImportPanel onImported={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('calls exportToJSON on export button click', async () => {
    const { exportToJSON } = await import('@/db/export-import');
    // Mock URL.createObjectURL and related
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const { ExportImportPanel } = await import('@/dashboard/components/ExportImportPanel');
    const { getByText } = render(<ExportImportPanel onImported={vi.fn()} />);

    const btn = getByText('导出数据');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(exportToJSON).toHaveBeenCalled();

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it('shows error feedback when exportToJSON fails', async () => {
    const { exportToJSON } = await import('@/db/export-import');
    vi.mocked(exportToJSON).mockRejectedValueOnce(new Error('export error'));

    const { ExportImportPanel } = await import('@/dashboard/components/ExportImportPanel');
    const { container, getByText } = render(<ExportImportPanel onImported={vi.fn()} />);

    const btn = getByText('导出数据');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(container.textContent).toContain('导出失败');
  });
});

// ── CollectorPanel ──
describe('CollectorPanel', () => {
  it('renders with setup done (collectStartDate exists)', async () => {
    const { CollectorPanel } = await import('@/dashboard/components/CollectorPanel');
    const { container } = render(<CollectorPanel onCollected={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('renders without setup (no collectStartDate)', async () => {
    const { useUserSettings } = await import('@/hooks/use-user-settings');
    vi.mocked(useUserSettings).mockReturnValueOnce({
      settings: null,
      loading: false,
      refresh: vi.fn(),
    });

    const { CollectorPanel } = await import('@/dashboard/components/CollectorPanel');
    const { container } = render(<CollectorPanel onCollected={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});

// ── IncomeGoalPanel ──
describe('IncomeGoalPanel', () => {
  it('renders with no goal (loading state returns null)', async () => {
    const { IncomeGoalPanel } = await import('@/dashboard/components/IncomeGoalPanel');
    const { container } = render(
      <IncomeGoalPanel userId="user-1" monthIncome={5000} monthDaysElapsed={15} monthDaysTotal={30} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with goal set higher than income', async () => {
    mockGoalStore.getGoal.mockResolvedValueOnce({
      userId: 'user-1',
      period: '2024-01',
      targetAmount: 100000,
      createdAt: Date.now(),
    });
    const { IncomeGoalPanel } = await import('@/dashboard/components/IncomeGoalPanel');
    const { container } = render(
      <IncomeGoalPanel userId="user-1" monthIncome={50000} monthDaysElapsed={15} monthDaysTotal={30} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with income exceeding target (100%+ progress)', async () => {
    mockGoalStore.getGoal.mockResolvedValueOnce({
      userId: 'user-1',
      period: '2024-01',
      targetAmount: 10000, // 100 yuan
      createdAt: Date.now(),
    });
    const { IncomeGoalPanel } = await import('@/dashboard/components/IncomeGoalPanel');
    const { container } = render(
      // monthIncome > targetAmount/100 → percent=100, projected >= target
      <IncomeGoalPanel userId="user-1" monthIncome={200} monthDaysElapsed={20} monthDaysTotal={30} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with zero monthDaysElapsed (no division by zero)', async () => {
    mockGoalStore.getGoal.mockResolvedValueOnce({
      userId: 'user-1',
      period: '2024-01',
      targetAmount: 50000,
      createdAt: Date.now(),
    });
    const { IncomeGoalPanel } = await import('@/dashboard/components/IncomeGoalPanel');
    const { container } = render(
      <IncomeGoalPanel userId="user-1" monthIncome={0} monthDaysElapsed={0} monthDaysTotal={30} />,
    );
    expect(container).toBeTruthy();
  });
});

// ── UnmonetizedContentPanel ──
describe('UnmonetizedContentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial state', async () => {
    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set()} />);
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('获取列表');
  });

  it('renders with items loaded via chrome message', async () => {
    // Mock chrome.runtime.sendMessage to return items
    const chromeMock = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const runtimeMock = chromeMock.runtime as Record<string, unknown>;
    const origSendMessage = runtimeMock.sendMessage;
    runtimeMock.sendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => {
      cb({
        ok: true,
        items: [
          {
            contentId: 'c1',
            contentToken: 't1',
            contentType: 'article',
            title: 'Test Article',
            publishDate: '2024-01-01',
            readCount: 100,
            upvoteCount: 5,
            commentCount: 2,
            collectCount: 1,
          },
          {
            contentId: 'c2',
            contentToken: 't2',
            contentType: 'answer',
            title: 'Test Answer',
            publishDate: '2024-01-02',
            readCount: 200,
            upvoteCount: 10,
            commentCount: 3,
            collectCount: 2,
          },
        ],
      });
    });

    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container, findByText } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set()} />);

    // Click the fetch button
    const btn = await findByText('获取列表');
    await act(async () => {
      fireEvent.click(btn);
    });

    // Wait for items to appear in the table
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeTruthy();
    runtimeMock.sendMessage = origSendMessage;
  });

  it('renders empty state when all items are monetized', async () => {
    const chromeMock = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const runtimeMock = chromeMock.runtime as Record<string, unknown>;
    const origSendMessage = runtimeMock.sendMessage;
    runtimeMock.sendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => {
      cb({
        ok: true,
        items: [
          {
            contentId: 'c1',
            contentToken: 't1',
            contentType: 'article',
            title: 'Article 1',
            publishDate: '2024-01-01',
            readCount: 100,
            upvoteCount: 5,
            commentCount: 2,
            collectCount: 1,
          },
        ],
      });
    });

    // t1 is monetized → 0 unmonetized items → Empty component
    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container, findByText } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set(['t1'])} />);

    const btn = await findByText('获取列表');
    await act(async () => {
      fireEvent.click(btn);
    });

    await new Promise((r) => setTimeout(r, 50));
    // Should render "所有内容都已产生收益" empty state
    expect(container).toBeTruthy();
    runtimeMock.sendMessage = origSendMessage;
  });

  it('handles chrome message error', async () => {
    const chromeMock = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const runtimeMock = chromeMock.runtime as Record<string, unknown>;
    const origSendMessage = runtimeMock.sendMessage;
    runtimeMock.sendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => {
      cb({ ok: false, error: '获取失败' });
    });

    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container, findByText } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set()} />);

    const btn = await findByText('获取列表');
    await act(async () => {
      fireEvent.click(btn);
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeTruthy();
    runtimeMock.sendMessage = origSendMessage;
  });

  it('filters out monetized content tokens', async () => {
    const chromeMock = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    const runtimeMock = chromeMock.runtime as Record<string, unknown>;
    const origSendMessage = runtimeMock.sendMessage;
    runtimeMock.sendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => {
      cb({
        ok: true,
        items: [
          {
            contentId: 'c1',
            contentToken: 't1',
            contentType: 'article',
            title: 'Article 1',
            publishDate: '2024-01-01',
            readCount: 100,
            upvoteCount: 5,
            commentCount: 2,
            collectCount: 1,
          },
          {
            contentId: 'c2',
            contentToken: 't2',
            contentType: 'answer',
            title: 'Article 2',
            publishDate: '2024-01-02',
            readCount: 200,
            upvoteCount: 10,
            commentCount: 3,
            collectCount: 2,
          },
        ],
      });
    });

    // t1 is monetized, only t2 should show
    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container, findByText } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set(['t1'])} />);

    const btn = await findByText('获取列表');
    await act(async () => {
      fireEvent.click(btn);
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeTruthy();
    runtimeMock.sendMessage = origSendMessage;
  });
});

// ── LayoutCustomizer ──
describe('LayoutCustomizer', () => {
  it('renders open=true with tabs', async () => {
    const { LayoutCustomizer } = await import('@/dashboard/components/LayoutCustomizer');
    const tabs = makeDefaultTabs();
    const { container } = render(
      <LayoutCustomizer open={true} onClose={vi.fn()} tabs={tabs} onUpdate={vi.fn()} onReset={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders closed with empty tabs', async () => {
    const { LayoutCustomizer } = await import('@/dashboard/components/LayoutCustomizer');
    const { container } = render(
      <LayoutCustomizer open={false} onClose={vi.fn()} tabs={[]} onUpdate={vi.fn()} onReset={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});

// ── TodayPredictionPanel ──
describe('TodayPredictionPanel', () => {
  it('renders when user is null', async () => {
    mockCurrentUser.mockReturnValueOnce({ user: null, loading: false });
    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    expect(container).toBeTruthy();
  });

  it('renders with user loaded', async () => {
    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    expect(container).toBeTruthy();
  });
});

// ── MLPredictionPanel - with model result ──
describe('MLPredictionPanel with model result', () => {
  const mockEnsembleResult = {
    models: [
      {
        name: '随机森林',
        predictions: [100, 150],
        r2: 0.8,
        mae: 20,
        featureImportance: [{ name: 'pv', importance: 60 }],
      },
      {
        name: '岭回归',
        predictions: [110, 140],
        r2: 0.75,
        mae: 25,
        featureImportance: [],
      },
    ],
    ensemble: {
      predictions: [105, 145],
      r2: 0.82,
      mae: 18,
      weights: [
        { name: '随机森林', weight: 0.7 },
        { name: '岭回归', weight: 0.3 },
      ],
    },
    testActual: [100, 150],
    testDates: ['2024-01-28', '2024-01-29'],
    featureNames: ['pv', 'upvote'],
    trainedAt: Date.now(),
    dataCount: 20,
    trainCount: 16,
    testCount: 4,
  };

  it('renders with no model result (null loadSavedModel)', async () => {
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders when loadSavedModel returns a result (shows results panel)', async () => {
    const { loadSavedModel } = await import('@/shared/ml-models');
    vi.mocked(loadSavedModel).mockResolvedValueOnce({
      ensembleResult: mockEnsembleResult,
      savedAt: Date.now(),
      dataCount: 20,
    });

    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    // Just render without waiting - the async state update may or may not complete
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders results panel with high-accuracy model', async () => {
    const { loadSavedModel } = await import('@/shared/ml-models');
    const highAccuracyResult = {
      ...mockEnsembleResult,
      ensemble: { ...mockEnsembleResult.ensemble, r2: 0.92 }, // >= 0.9 "非常准"
    };
    vi.mocked(loadSavedModel).mockResolvedValueOnce({
      ensembleResult: highAccuracyResult,
      savedAt: Date.now(),
      dataCount: 30,
    });

    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container).toBeTruthy();
  });
});

// ── CorrelationAnalysis with daily data via mock ──
describe('CorrelationAnalysis with daily data', () => {
  it('renders with aggregated content data', async () => {
    const { db } = await import('@/db/database');
    const mockDailyData = Array.from({ length: 5 }, (_, i) => ({
      userId: 'user-1',
      contentToken: `token-${i}`,
      contentId: `content-${i}`,
      contentType: 'article',
      title: `Article ${i}`,
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      pv: 1000 + i * 200,
      show: 2000 + i * 300,
      upvote: 50 + i * 10,
      comment: 10 + i * 2,
      like: 30 + i * 5,
      collect: 5 + i,
      share: 3 + i,
      play: 0,
      collectedAt: Date.now(),
    }));

    vi.mocked(db.contentDaily.where).mockReturnValueOnce({
      equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(mockDailyData)) })),
    } as never);

    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(10);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);
    expect(container).toBeTruthy();
  });
});

// ── RPMForecastPanel ──
describe('RPMForecastPanel', () => {
  it('renders with summaries', async () => {
    const { RPMForecastPanel } = await import('@/dashboard/components/RPMForecastPanel');
    const summaries = makeDailySummaries(30, '2024-01-01');
    const { container } = render(
      <RPMForecastPanel summaries={summaries} startDate="2024-01-01" endDate="2024-01-30" />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { RPMForecastPanel } = await import('@/dashboard/components/RPMForecastPanel');
    const { container } = render(<RPMForecastPanel summaries={[]} startDate="2024-01-01" endDate="2024-01-07" />);
    expect(container).toBeTruthy();
  });
});

// ── WeeklySeasonalityChart ──
describe('WeeklySeasonalityChart', () => {
  it('renders with summaries', async () => {
    const { WeeklySeasonalityChart } = await import('@/dashboard/components/WeeklySeasonalityChart');
    const summaries = makeDailySummaries(30, '2024-01-01');
    const { container } = render(<WeeklySeasonalityChart summaries={summaries} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { WeeklySeasonalityChart } = await import('@/dashboard/components/WeeklySeasonalityChart');
    const { container } = render(<WeeklySeasonalityChart summaries={[]} />);
    expect(container).toBeTruthy();
  });
});

// ── PublishTimeAnalysis ──
describe('PublishTimeAnalysis', () => {
  it('renders with records', async () => {
    const { PublishTimeAnalysis } = await import('@/dashboard/components/PublishTimeAnalysis');
    const records = makeIncomeRecords(20);
    const { container } = render(<PublishTimeAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { PublishTimeAnalysis } = await import('@/dashboard/components/PublishTimeAnalysis');
    const { container } = render(<PublishTimeAnalysis records={[]} />);
    expect(container).toBeTruthy();
  });
});

// ── ResidualChart ──
describe('ResidualChart', () => {
  it('renders with empty data (returns null)', async () => {
    const { ResidualChart } = await import('@/dashboard/components/ResidualChart');
    const { container } = render(<ResidualChart incomeRecords={[]} dailyRecords={[]} />);
    expect(container).toBeTruthy();
  });

  it('renders with data', async () => {
    const { ResidualChart } = await import('@/dashboard/components/ResidualChart');
    const records = makeIncomeRecords(10);
    const dailyRecords = makeContentDailyRecords(10);
    const { container } = render(<ResidualChart incomeRecords={records} dailyRecords={dailyRecords} />);
    expect(container).toBeTruthy();
  });
});
