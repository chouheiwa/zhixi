import React from 'react';
import { render, screen } from '../../helpers/render';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeDailySummaries, makeIncomeRecords } from '../../helpers/mock-data';

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn((props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'echarts-mock', 'data-option': JSON.stringify(props.option) }),
  ),
}));

vi.mock('echarts', () => ({
  init: vi.fn(),
  graphic: { LinearGradient: vi.fn() },
}));

describe('DailyTrendChart', () => {
  it('renders with valid summaries', async () => {
    const { DailyTrendChart } = await import('@/dashboard/components/DailyTrendChart');
    const summaries = makeDailySummaries(7, '2024-01-01');
    const { container } = render(<DailyTrendChart summaries={summaries} startDate="2024-01-01" endDate="2024-01-07" />);
    expect(container).toBeTruthy();
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { DailyTrendChart } = await import('@/dashboard/components/DailyTrendChart');
    const { container } = render(<DailyTrendChart summaries={[]} startDate="2024-01-01" endDate="2024-01-07" />);
    expect(container).toBeTruthy();
  });
});

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

describe('PublishTimeAnalysis', () => {
  it('renders with records', async () => {
    const { PublishTimeAnalysis } = await import('@/dashboard/components/PublishTimeAnalysis');
    const records = makeIncomeRecords(10);
    const { container } = render(<PublishTimeAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { PublishTimeAnalysis } = await import('@/dashboard/components/PublishTimeAnalysis');
    const { container } = render(<PublishTimeAnalysis records={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('ResidualChart', () => {
  it('renders with records', async () => {
    const { ResidualChart } = await import('@/dashboard/components/ResidualChart');
    const incomeRecords = makeIncomeRecords(5);
    const dailyRecords = Array.from({ length: 5 }, (_, i) => ({
      userId: 'user-1',
      contentToken: `token-${i}`,
      contentId: `content-${i}`,
      contentType: 'article',
      title: `Article ${i}`,
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      pv: 500 + i * 100,
      show: 1000,
      upvote: 10,
      comment: 5,
      like: 8,
      collect: 2,
      share: 1,
      play: 0,
      collectedAt: Date.now(),
    }));
    const { container } = render(<ResidualChart incomeRecords={incomeRecords} dailyRecords={dailyRecords} />);
    expect(container).toBeTruthy();
  });
});

describe('RPMForecastPanel', () => {
  it('renders with summaries', async () => {
    const { RPMForecastPanel } = await import('@/dashboard/components/RPMForecastPanel');
    const summaries = makeDailySummaries(14, '2024-01-01');
    const { container } = render(
      <RPMForecastPanel summaries={summaries} startDate="2024-01-01" endDate="2024-01-14" />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty summaries', async () => {
    const { RPMForecastPanel } = await import('@/dashboard/components/RPMForecastPanel');
    const { container } = render(<RPMForecastPanel summaries={[]} startDate="2024-01-01" endDate="2024-01-07" />);
    expect(container).toBeTruthy();
  });
});
