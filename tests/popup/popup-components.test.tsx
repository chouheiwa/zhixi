import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeDailySummary, makeDailySummaries } from '../helpers/mock-data';

// Mock echarts for WeekSparkline
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

describe('TodaySummary', () => {
  it('renders with summary data', async () => {
    const { TodaySummary } = await import('@/popup/components/TodaySummary');
    const summary = makeDailySummary({ totalIncome: 5000, totalRead: 2000 });
    const { container } = render(<TodaySummary summary={summary} loading={false} />);
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('50.00');
  });

  it('renders loading state', async () => {
    const { TodaySummary } = await import('@/popup/components/TodaySummary');
    const { container } = render(<TodaySummary summary={undefined} loading={true} />);
    expect(container.textContent).toContain('加载中');
  });

  it('renders with undefined summary', async () => {
    const { TodaySummary } = await import('@/popup/components/TodaySummary');
    const { container } = render(<TodaySummary summary={undefined} loading={false} />);
    expect(container).toBeTruthy();
  });
});

describe('WeekSparkline', () => {
  it('renders with summaries', async () => {
    const { WeekSparkline } = await import('@/popup/components/WeekSparkline');
    const summaries = makeDailySummaries(7);
    const { container } = render(<WeekSparkline summaries={summaries} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { WeekSparkline } = await import('@/popup/components/WeekSparkline');
    const { container } = render(<WeekSparkline summaries={[]} />);
    expect(container).toBeTruthy();
  });
});
