import React from 'react';
import { render, cleanup } from '../../helpers/render';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { makeDailySummaries, makeIncomeRecords, makeDefaultTabs } from '../../helpers/mock-data';

afterEach(() => {
  cleanup();
});

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn((props: Record<string, unknown>) => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

vi.mock('echarts', () => ({
  init: vi.fn(),
  graphic: { LinearGradient: vi.fn() },
}));

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(() => ({
    add: vi.fn(),
    compile: vi.fn(),
    fit: vi.fn(() => Promise.resolve({ history: { loss: [0.1] } })),
    predict: vi.fn(() => ({
      dataSync: vi.fn(() => [100]),
      dispose: vi.fn(),
    })),
    dispose: vi.fn(),
  })),
  layers: {
    dense: vi.fn(() => ({})),
    batchNormalization: vi.fn(() => ({})),
    activation: vi.fn(() => ({})),
    dropout: vi.fn(() => ({})),
  },
  train: { adam: vi.fn() },
  tensor2d: vi.fn(() => ({
    dispose: vi.fn(),
  })),
}));

// Mock xlsx - need default export and named exports
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

// Mock dnd-kit
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

// Mock goal-store for IncomeGoalPanel
vi.mock('@/db/goal-store', () => ({
  getGoal: vi.fn(() => Promise.resolve(null)),
  saveGoal: vi.fn(() => Promise.resolve()),
  deleteGoal: vi.fn(() => Promise.resolve()),
  getIncomeGoal: vi.fn(() => Promise.resolve(null)),
  saveIncomeGoal: vi.fn(() => Promise.resolve()),
}));

// Mock use-collector
vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(),
    logs: [],
  })),
}));

// Mock useCurrentUser
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({
    user: { id: 'user-1', urlToken: 'test', name: 'Test', avatarUrl: '' },
    loading: false,
  })),
}));

// Helper to create a chainable Dexie-like mock
function mockTable() {
  const toArrayFn = vi.fn(() => Promise.resolve([]));
  const andFn = vi.fn(() => ({ toArray: toArrayFn }));
  const equalsFn = vi.fn(() => ({
    toArray: toArrayFn,
    and: andFn,
    reverse: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
  }));
  return {
    where: vi.fn(() => ({ equals: equalsFn })),
    get: vi.fn(() => Promise.resolve(null)),
    put: vi.fn(() => Promise.resolve()),
    bulkPut: vi.fn(() => Promise.resolve()),
  };
}

// Mock database with all tables used by components
vi.mock('@/db/database', () => ({
  db: {
    realtimeAggrRecords: mockTable(),
    contentDailyRecords: mockTable(),
    contentDaily: mockTable(),
    contentDailyCache: mockTable(),
    incomeRecords: mockTable(),
    mlModels: mockTable(),
    userSettings: mockTable(),
  },
}));

// Mock realtime-store
vi.mock('@/db/realtime-store', () => ({
  getRealtimeAggrLatestDate: vi.fn(() => Promise.resolve(null)),
  upsertRealtimeAggr: vi.fn(() => Promise.resolve()),
  getTodayRealtimeSnapshots: vi.fn(() => Promise.resolve([])),
  getAllRealtimeAggr: vi.fn(() => Promise.resolve([])),
}));

// Mock income-store for TodayPredictionPanel
vi.mock('@/db/income-store', () => ({
  getAllDailySummaries: vi.fn(() => Promise.resolve([])),
  getUserSettings: vi.fn(() => Promise.resolve(null)),
  saveUserSettings: vi.fn(() => Promise.resolve()),
  getMissingDates: vi.fn(() => Promise.resolve([])),
  upsertIncomeRecords: vi.fn(() => Promise.resolve()),
  markDateSynced: vi.fn(() => Promise.resolve()),
}));

// Mock ml-models
vi.mock('@/shared/ml-models', () => ({
  loadSavedModel: vi.fn(() => Promise.resolve(null)),
  trainModel: vi.fn(() => Promise.resolve(null)),
  saveModel: vi.fn(() => Promise.resolve()),
  predictNext: vi.fn(() => null),
}));

// Mock ml-features
vi.mock('@/shared/ml-features', () => ({
  buildFeatureRows: vi.fn(() => []),
  buildPredictionFeatures: vi.fn(() => []),
  FEATURE_NAMES: ['read', 'interaction', 'income'],
}));

describe('ExcelExportButton', () => {
  it('generates excel report without throwing', async () => {
    const { generateExcelReport } = await import('@/dashboard/components/ExcelExportButton');
    const summaries = makeDailySummaries(7);
    const records = makeIncomeRecords(5);
    expect(() =>
      generateExcelReport({
        userName: 'TestUser',
        allSummaries: summaries,
        allRecords: records,
      }),
    ).not.toThrow();
  });

  it('handles empty data', async () => {
    const { generateExcelReport } = await import('@/dashboard/components/ExcelExportButton');
    expect(() =>
      generateExcelReport({
        userName: 'TestUser',
        allSummaries: [],
        allRecords: [],
      }),
    ).not.toThrow();
  });
});

describe('MLPredictionPanel', () => {
  it('renders with records', async () => {
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const records = makeIncomeRecords(30);
    const { container } = render(<MLPredictionPanel records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with insufficient data', async () => {
    const { MLPredictionPanel } = await import('@/dashboard/components/MLPredictionPanel');
    const { container } = render(<MLPredictionPanel records={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('TodayPredictionPanel', () => {
  it('renders without crashing', async () => {
    const { TodayPredictionPanel } = await import('@/dashboard/components/TodayPredictionPanel');
    const { container } = render(<TodayPredictionPanel />);
    expect(container).toBeTruthy();
  });
});

describe('IncomeGoalPanel', () => {
  it('renders with props', async () => {
    const { IncomeGoalPanel } = await import('@/dashboard/components/IncomeGoalPanel');
    const { container } = render(
      <IncomeGoalPanel userId="user-1" monthIncome={500} monthDaysElapsed={15} monthDaysTotal={30} />,
    );
    expect(container).toBeTruthy();
  });
});

describe('MilestonesPage', () => {
  it('renders with data', async () => {
    const { MilestonesPage } = await import('@/dashboard/components/MilestonesPage');
    const summaries = makeDailySummaries(30);
    const records = makeIncomeRecords(20);
    const { container } = render(<MilestonesPage allSummaries={summaries} allRecords={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty data', async () => {
    const { MilestonesPage } = await import('@/dashboard/components/MilestonesPage');
    const { container } = render(<MilestonesPage allSummaries={[]} allRecords={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('LayoutCustomizer', () => {
  it('renders when closed without crashing', async () => {
    const { LayoutCustomizer } = await import('@/dashboard/components/LayoutCustomizer');
    const tabs = makeDefaultTabs();
    const { container } = render(
      <LayoutCustomizer open={false} onClose={vi.fn()} tabs={tabs} onUpdate={vi.fn()} onReset={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
