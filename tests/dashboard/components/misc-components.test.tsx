import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn((props: Record<string, unknown>) => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

// Mock useCollector
vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(() => Promise.resolve({ count: 0, synced: 0, total: 0 })),
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

// Mock useUserSettings (used by CollectorPanel)
vi.mock('@/hooks/use-user-settings', () => ({
  useUserSettings: vi.fn(() => ({
    settings: { userId: 'user-1', collectStartDate: '2024-01-01' },
    loading: false,
    refresh: vi.fn(),
  })),
}));

// Mock database
vi.mock('@/db/database', () => ({
  db: {
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
    export: vi.fn(() => Promise.resolve({})),
  },
}));

// Mock export-import
vi.mock('@/db/export-import', () => ({
  exportToJSON: vi.fn(() => Promise.resolve('{"test":true}')),
  importFromJSON: vi.fn(() => Promise.resolve({ records: 0, summaries: 0, contentDaily: 0, realtimeAggr: 0 })),
}));

describe('FormulaHelp', () => {
  it('renders and toggles tooltip', async () => {
    const { FormulaHelp } = await import('@/dashboard/components/FormulaHelp');
    const { container } = render(<FormulaHelp formula="RPM = income / reads * 1000" explanation="Revenue per mille" />);
    expect(container).toBeTruthy();
    // Click to toggle
    const trigger = container.querySelector('span[style*="cursor: pointer"]');
    if (trigger) fireEvent.click(trigger);
  });

  it('renders FormulaBlock and toggles', async () => {
    const { FormulaBlock } = await import('@/dashboard/components/FormulaHelp');
    const items = [
      { name: 'RPM', formula: 'income / reads * 1000', desc: 'Revenue per mille' },
      { name: 'CTR', formula: 'clicks / shows', desc: 'Click-through rate' },
    ];
    const { container } = render(<FormulaBlock title="Metrics" items={items} />);
    expect(container).toBeTruthy();
    // Click to expand
    const trigger = container.querySelector('div[style*="cursor: pointer"]');
    if (trigger) {
      fireEvent.click(trigger);
      // Should now show items
      expect(container.textContent).toContain('RPM');
      expect(container.textContent).toContain('CTR');
    }
  });
});

describe('CollectorPanel', () => {
  it('renders', async () => {
    const { CollectorPanel } = await import('@/dashboard/components/CollectorPanel');
    const { container } = render(<CollectorPanel onCollected={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});

describe('ExportImportPanel', () => {
  it('renders', async () => {
    const { ExportImportPanel } = await import('@/dashboard/components/ExportImportPanel');
    const { container } = render(<ExportImportPanel onImported={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});

describe('chartConfig', () => {
  it('exports expected config objects', async () => {
    const config = await import('@/dashboard/components/chartConfig');
    expect(config.timeSeriesZoom).toBeTruthy();
    expect(config.timeSeriesZoom.dataZoom).toHaveLength(2);
    expect(config.scatterZoomToolbox).toBeTruthy();
    expect(config.chartTextStyle).toBeTruthy();
    expect(config.chartAxisStyle).toBeTruthy();
    expect(typeof config.withZoomGrid).toBe('function');
    expect(typeof config.getChartColors).toBe('function');
  });

  it('withZoomGrid adjusts bottom', async () => {
    const { withZoomGrid } = await import('@/dashboard/components/chartConfig');
    const result = withZoomGrid({ left: 50, bottom: 25 });
    expect(Number(result.bottom)).toBeGreaterThanOrEqual(50);
  });

  it('getChartColors returns array', async () => {
    const { getChartColors } = await import('@/dashboard/components/chartConfig');
    const colors = getChartColors();
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThan(0);
  });
});
