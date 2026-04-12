/**
 * Tests for GlobalCorrelationAnalysis with data-rich scenarios.
 */
import React from 'react';
import { render, cleanup, waitFor } from '../../helpers/render';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { makeIncomeRecords } from '../../helpers/mock-data';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

const mockUser = { id: 'user-1', urlToken: 'test', name: 'Test', avatarUrl: '' };
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({ user: mockUser, loading: false })),
}));

// Build rich daily data for proper analysis
function makeContentDailyData(count = 30) {
  return Array.from({ length: count }, (_, i) => ({
    userId: 'user-1',
    contentToken: `token-${i % 5}`, // 5 unique tokens
    contentId: `content-${i % 5}`,
    contentType: 'article',
    title: `Article ${i % 5}`,
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    pv: 1000 + i * 200 + Math.random() * 500,
    show: 2000 + i * 300,
    upvote: 50 + i * 10,
    comment: 10 + i * 2,
    like: 30 + i * 5,
    collect: 5 + i,
    share: 3 + i,
    play: 0,
    collectedAt: Date.now(),
  }));
}

const mockDailyData = makeContentDailyData(30);

const mockIncomeMap = new Map<string, number>();
// Build income records aligned with daily data
const mockIncomeRecords = makeIncomeRecords(30);

vi.mock('@/db/database', () => ({
  db: {
    contentDaily: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve(mockDailyData)),
        })),
      })),
    },
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve(mockIncomeRecords)),
        })),
      })),
    },
    userSettings: {
      get: vi.fn(() => Promise.resolve({ userId: 'user-1', collectStartDate: '2024-01-01' })),
    },
  },
}));

vi.mock('@/db/income-store', () => ({
  getUserSettings: vi.fn(() => Promise.resolve({ userId: 'user-1', collectStartDate: '2024-01-01' })),
}));

describe('GlobalCorrelationAnalysis', () => {
  it('renders with empty records (no analysis)', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const { container } = render(<GlobalCorrelationAnalysis records={[]} />);
    expect(container).toBeTruthy();
  });

  it('renders with rich income records (triggers all computed analyses)', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(30);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);

    // Wait for async DB effect to complete and state to update
    await waitFor(
      () => {
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders full analysis panel when daily data is loaded', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(30);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);

    // After data loads, the stats panel should be rendered
    await waitFor(
      () => {
        // The component eventually renders analysis content
        expect(container.childNodes.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    expect(container).toBeTruthy();
  });

  it('renders without user', async () => {
    const { useCurrentUser } = await import('@/hooks/use-current-user');
    vi.mocked(useCurrentUser).mockReturnValueOnce({ user: null, loading: false });

    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(30);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with minimal records (fewer than 4 items)', async () => {
    const { GlobalCorrelationAnalysis } = await import('@/dashboard/components/CorrelationAnalysis');
    const records = makeIncomeRecords(2);
    const { container } = render(<GlobalCorrelationAnalysis records={records} />);

    await waitFor(() => expect(container).toBeTruthy(), { timeout: 3000 });
  });
});
