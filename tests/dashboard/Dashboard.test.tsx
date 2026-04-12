import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeDailySummaries, makeIncomeRecords, makeDefaultTabs } from '../helpers/mock-data';

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));
vi.mock('echarts', () => ({ init: vi.fn(), graphic: { LinearGradient: vi.fn() } }));

// Mock TensorFlow
vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(),
  layers: { dense: vi.fn(), batchNormalization: vi.fn(), activation: vi.fn(), dropout: vi.fn() },
  train: { adam: vi.fn() },
  tensor2d: vi.fn(),
}));

// Mock xlsx
vi.mock('xlsx', () => ({
  utils: { json_to_sheet: vi.fn(), book_new: vi.fn(), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));

// Mock driver.js
vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({ drive: vi.fn(), destroy: vi.fn(), highlight: vi.fn() })),
}));

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
  useSortable: vi.fn(() => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null })),
  arrayMove: vi.fn((arr: unknown[]) => [...arr]),
  sortableKeyboardCoordinates: vi.fn(),
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

// Mock hooks
const mockSummaries = makeDailySummaries(7);
const mockRecords = makeIncomeRecords(5);
const mockTabs = makeDefaultTabs();

vi.mock('@/hooks/use-income-data', () => ({
  useIncomeData: vi.fn(() => ({
    records: mockRecords,
    summaries: mockSummaries,
    loading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({
    user: { id: 'user-1', urlToken: 'test-token', name: 'TestUser', avatarUrl: '' },
    loading: false,
  })),
}));

vi.mock('@/hooks/use-user-settings', () => ({
  useUserSettings: vi.fn(() => ({
    settings: { userId: 'user-1', collectStartDate: '2024-01-01', autoSyncEnabled: true },
    loading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(() => Promise.resolve({ count: 0, synced: 0, total: 0 })),
    logs: [],
  })),
}));

vi.mock('@/hooks/use-panel-layout', () => ({
  usePanelLayout: vi.fn(() => ({
    layout: { userId: 'user-1', tabs: mockTabs },
    updateLayout: vi.fn(),
    resetLayout: vi.fn(),
  })),
}));

vi.mock('@/db/income-store', () => ({
  getAllDailySummaries: vi.fn(() => Promise.resolve(mockSummaries)),
  saveUserSettings: vi.fn(),
}));

vi.mock('@/db/database', () => ({
  db: {
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve(mockRecords)),
        })),
      })),
    },
    contentDailyRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          and: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    },
    realtimeAggrRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          reverse: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    },
  },
}));

vi.mock('@/db/goal-store', () => ({
  getGoal: vi.fn(() => Promise.resolve(undefined)),
  saveGoal: vi.fn(),
  deleteGoal: vi.fn(),
  getAllGoals: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/db/realtime-store', () => ({
  getRealtimeAggrLatestDate: vi.fn(() => Promise.resolve(null)),
  upsertRealtimeAggr: vi.fn(),
  getTodayRealtimeSnapshots: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/api/zhihu-creations', () => ({
  fetchAllCreations: vi.fn(() => Promise.resolve({ articles: [], answers: [], pins: [] })),
}));

vi.mock('@/db/export-import', () => ({
  exportToJSON: vi.fn(() => Promise.resolve('{}')),
  importFromJSON: vi.fn(() => Promise.resolve({ records: 0, summaries: 0, contentDaily: 0, realtimeAggr: 0 })),
}));

// Mock tour management
vi.mock('@/dashboard/hooks/useTourManagement', () => ({
  useTourManagement: vi.fn(() => ({
    useDemo: false,
    effectiveSummaries: mockSummaries,
    effectiveRecords: mockRecords,
    effectiveDateRange: { start: '2024-01-01', end: '2024-01-07' },
    showNewFeatureBanner: false,
    newFeatureCount: 0,
    handleStartTour: vi.fn(),
    handleViewNewFeatures: vi.fn(),
    handleDismissNewFeatures: vi.fn(),
  })),
}));

// Mock sync orchestration
vi.mock('@/dashboard/hooks/useSyncOrchestration', () => ({
  useSyncOrchestration: vi.fn(() => ({
    syncMsg: '',
    setSyncMsg: vi.fn(),
    importMsg: '',
    setImportMsg: vi.fn(),
    setupOpen: false,
    setSetupOpen: vi.fn(),
    setupDate: '',
    setSetupDate: vi.fn(),
    fileInputRef: { current: null },
    handleSyncAll: vi.fn(),
    handleSyncIncome: vi.fn(),
    handleSyncRealtimeAggr: vi.fn(),
    handleFetchContentDaily: vi.fn(),
    handleFetchTodayData: vi.fn(),
    handleExport: vi.fn(),
    handleImport: vi.fn(),
  })),
}));

// Mock tour banner
vi.mock('@/dashboard/tour/NewFeatureBanner', () => ({
  NewFeatureBanner: vi.fn(() => null),
}));

describe('Dashboard', () => {
  // Dashboard is wrapped in a HostPermissionGate that resolves asynchronously.
  // Tests must waitFor the first post-check render before asserting on content.
  it('renders main dashboard with data', async () => {
    const { Dashboard } = await import('@/dashboard/Dashboard');
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(container.textContent).toContain('知析'));
    expect(container.textContent).toContain('TestUser');
  });

  it('renders summary cards', async () => {
    const { Dashboard } = await import('@/dashboard/Dashboard');
    const { container } = render(<Dashboard />);
    // Check that summary card headers exist
    await waitFor(() => expect(container.textContent).toContain('昨日'));
    expect(container.textContent).toContain('本月');
    expect(container.textContent).toContain('总览');
  });

  it('renders loading state when user is loading', async () => {
    const { useCurrentUser } = await import('@/hooks/use-current-user');
    (useCurrentUser as ReturnType<typeof vi.fn>).mockReturnValueOnce({ user: null, loading: true });

    const { Dashboard } = await import('@/dashboard/Dashboard');
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(container.textContent).toContain('正在连接知乎'));
  });

  it('prompts for host permission when not granted', async () => {
    const { chromeMock } = await import('../setup/chrome-mock');
    chromeMock.permissions._setGranted(false);

    const { Dashboard } = await import('@/dashboard/Dashboard');
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(container.textContent).toContain('授权访问 zhihu.com'));
  });
});
