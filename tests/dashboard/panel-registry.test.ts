import { describe, expect, it, vi } from 'vitest';

// Mock all lazy-loaded component modules so React.lazy doesn't actually import them
vi.mock('echarts-for-react', () => ({ default: vi.fn() }));
vi.mock('echarts', () => ({ init: vi.fn(), graphic: { LinearGradient: vi.fn() } }));
vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(),
  layers: { dense: vi.fn(), batchNormalization: vi.fn(), activation: vi.fn(), dropout: vi.fn() },
  train: { adam: vi.fn() },
  tensor2d: vi.fn(),
}));
vi.mock('xlsx', () => ({
  utils: { json_to_sheet: vi.fn(), book_new: vi.fn(), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));
vi.mock('@/db/goal-store', () => ({
  getIncomeGoal: vi.fn(() => Promise.resolve(null)),
  saveIncomeGoal: vi.fn(),
}));
vi.mock('@/db/database', () => ({
  db: {
    realtimeAggrRecords: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })),
    },
    contentDailyRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          and: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    },
    incomeRecords: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })) })) },
  },
}));
vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({ status: { isCollecting: false, progress: 0, total: 0 }, sync: vi.fn(), logs: [] })),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({ user: { id: 'u1', urlToken: 't', name: 'T', avatarUrl: '' }, loading: false })),
}));
vi.mock('@/db/realtime-store', () => ({
  getRealtimeAggrLatestDate: vi.fn(() => Promise.resolve(null)),
  upsertRealtimeAggr: vi.fn(),
  getTodayRealtimeSnapshots: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/api/zhihu-creations', () => ({
  fetchAllCreations: vi.fn(() => Promise.resolve({ articles: [], answers: [], pins: [] })),
}));

describe('panel-registry', () => {
  it('getPanelRegistry returns all panels', async () => {
    const { getPanelRegistry } = await import('@/dashboard/panel-registry');
    const panels = getPanelRegistry();
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.key).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.tab).toBeTruthy();
      expect(typeof p.render).toBe('function');
    }
  });

  it('getPanelsByTab returns panels for given tab', async () => {
    const { getPanelsByTab } = await import('@/dashboard/panel-registry');
    const overviewPanels = getPanelsByTab('overview');
    expect(overviewPanels.length).toBeGreaterThan(0);
    for (const p of overviewPanels) {
      expect(p.tab).toBe('overview');
    }
  });

  it('getPanelsByTab returns empty for unknown tab', async () => {
    const { getPanelsByTab } = await import('@/dashboard/panel-registry');
    expect(getPanelsByTab('nonexistent')).toEqual([]);
  });

  it('getDefaultTabs returns correct structure', async () => {
    const { getDefaultTabs } = await import('@/dashboard/panel-registry');
    const tabs = getDefaultTabs();
    expect(tabs.length).toBe(4);
    expect(tabs[0].key).toBe('overview');
    expect(tabs[0].visible).toBe(true);
    expect(tabs[0].order).toBe(0);
    expect(tabs[0].panels.length).toBeGreaterThan(0);

    const contentTab = tabs.find((t) => t.key === 'content');
    expect(contentTab).toBeTruthy();
    expect(contentTab!.label).toBe('有收益内容明细');

    const mlTab = tabs.find((t) => t.key === 'ml');
    expect(mlTab).toBeTruthy();
    expect(mlTab!.panels.length).toBeGreaterThan(0);
  });

  it('getPanelMeta returns meta for known key', async () => {
    const { getPanelMeta } = await import('@/dashboard/panel-registry');
    const meta = getPanelMeta('dailyTrend');
    expect(meta).toBeTruthy();
    expect(meta!.key).toBe('dailyTrend');
    expect(meta!.label).toBe('日趋势图');
  });

  it('getPanelMeta returns undefined for unknown key', async () => {
    const { getPanelMeta } = await import('@/dashboard/panel-registry');
    expect(getPanelMeta('nonexistent')).toBeUndefined();
  });
});
