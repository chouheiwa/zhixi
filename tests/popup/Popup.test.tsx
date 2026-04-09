import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeDailySummaries } from '../helpers/mock-data';

// Mock echarts (WeekSparkline uses it)
vi.mock('echarts-for-react', () => ({
  default: vi.fn(() => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

const mockSummaries = makeDailySummaries(7);

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({
    user: { id: 'user-1', urlToken: 'test', name: 'TestUser', avatarUrl: '' },
    loading: false,
  })),
}));

vi.mock('@/hooks/use-user-settings', () => ({
  useUserSettings: vi.fn(() => ({
    settings: { userId: 'user-1', collectStartDate: '2024-01-01' },
    loading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-income-data', () => ({
  useIncomeData: vi.fn(() => ({
    records: [],
    summaries: mockSummaries,
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

describe('Popup', () => {
  it('renders with user setup done', async () => {
    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('知析');
    expect(container.textContent).toContain('TestUser');
    expect(container.textContent).toContain('详细分析');
  });

  it('renders loading state', async () => {
    const { useCurrentUser } = await import('@/hooks/use-current-user');
    (useCurrentUser as ReturnType<typeof vi.fn>).mockReturnValueOnce({ user: null, loading: true });

    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container.textContent).toContain('正在连接知乎');
  });

  it('renders setup state when no collectStartDate', async () => {
    const { useUserSettings } = await import('@/hooks/use-user-settings');
    (useUserSettings as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      settings: { userId: 'user-1' },
      loading: false,
      refresh: vi.fn(),
    });

    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container.textContent).toContain('首次使用');
  });

  it('renders sync button', async () => {
    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container.textContent).toContain('同步数据');
  });

  it('shows collecting state', async () => {
    const { useCollector } = await import('@/hooks/use-collector');
    (useCollector as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      status: { isCollecting: true, progress: 5, total: 10, currentDate: '2024-01-05' },
      sync: vi.fn(),
      logs: [],
    });

    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container.textContent).toContain('同步中');
  });

  it('shows error state when status has error', async () => {
    const { useCollector } = await import('@/hooks/use-collector');
    (useCollector as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      status: { isCollecting: false, progress: 0, total: 0, error: '网络错误' },
      sync: vi.fn(),
      logs: [],
    });

    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container.textContent).toContain('网络错误');
  });

  it('shows no summary when no data', async () => {
    const { useIncomeData } = await import('@/hooks/use-income-data');
    (useIncomeData as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      records: [],
      summaries: [],
      loading: false,
      refresh: vi.fn(),
    });

    const { Popup } = await import('@/popup/Popup');
    const { container } = render(<Popup />);
    expect(container).toBeTruthy();
  });
});
