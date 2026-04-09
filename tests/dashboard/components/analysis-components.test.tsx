import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeDailySummaries, makeIncomeRecords } from '../../helpers/mock-data';

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn((props: Record<string, unknown>) => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

vi.mock('echarts', () => ({
  init: vi.fn(),
  graphic: { LinearGradient: vi.fn() },
}));

// Mock hooks and db for CorrelationAnalysis (it uses useCurrentUser, db.contentDaily, db.incomeRecords, db.userSettings)
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({
    user: { id: 'user-1', urlToken: 'test', name: 'Test', avatarUrl: '' },
    loading: false,
  })),
}));

function mockTable() {
  const toArrayFn = vi.fn(() => Promise.resolve([]));
  return {
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: toArrayFn,
        and: vi.fn(() => ({ toArray: toArrayFn })),
      })),
    })),
    get: vi.fn(() => Promise.resolve(null)),
  };
}

vi.mock('@/db/database', () => ({
  db: {
    contentDaily: mockTable(),
    contentDailyRecords: mockTable(),
    incomeRecords: mockTable(),
    userSettings: mockTable(),
  },
}));

describe('CorrelationAnalysis', () => {
  it('renders with records', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(20);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with few records', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(2);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const { container } = render(<GlobalCorrelationAnalysis records={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('ConversionAnalysis', () => {
  it('renders with records', async () => {
    const { ConversionAnalysis } = await import('@/dashboard/components/ConversionAnalysis');
    const records = makeIncomeRecords(10);
    const { container } = render(<ConversionAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { ConversionAnalysis } = await import('@/dashboard/components/ConversionAnalysis');
    const { container } = render(<ConversionAnalysis records={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('LifecycleAnalysis', () => {
  it('renders with records', async () => {
    const { LifecycleAnalysis } = await import('@/dashboard/components/LifecycleAnalysis');
    const records = makeIncomeRecords(15);
    const { container } = render(<LifecycleAnalysis incomeRecords={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { LifecycleAnalysis } = await import('@/dashboard/components/LifecycleAnalysis');
    const { container } = render(<LifecycleAnalysis incomeRecords={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('AnomalyDetectionPanel', () => {
  it('renders with summaries', async () => {
    const { AnomalyDetectionPanel } = await import('@/dashboard/components/AnomalyDetectionPanel');
    const summaries = makeDailySummaries(30, '2024-01-01');
    const { container } = render(
      <AnomalyDetectionPanel summaries={summaries} startDate="2024-01-01" endDate="2024-01-30" />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { AnomalyDetectionPanel } = await import('@/dashboard/components/AnomalyDetectionPanel');
    const { container } = render(<AnomalyDetectionPanel summaries={[]} startDate="2024-01-01" endDate="2024-01-07" />);
    expect(container).toBeTruthy();
  });
});

describe('ContentTypeComparisonPanel', () => {
  it('renders with records', async () => {
    const { ContentTypeComparisonPanel } = await import('@/dashboard/components/ContentTypeComparisonPanel');
    const records = makeIncomeRecords(10);
    const { container } = render(<ContentTypeComparisonPanel records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { ContentTypeComparisonPanel } = await import('@/dashboard/components/ContentTypeComparisonPanel');
    const { container } = render(<ContentTypeComparisonPanel records={[]} />);
    expect(container).toBeTruthy();
  });
});
