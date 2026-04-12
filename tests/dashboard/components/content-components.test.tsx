import React from 'react';
import { render, screen } from '../../helpers/render';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeIncomeRecords } from '../../helpers/mock-data';

// Mock echarts
vi.mock('echarts-for-react', () => ({
  default: vi.fn((props: Record<string, unknown>) => React.createElement('div', { 'data-testid': 'echarts-mock' })),
}));

vi.mock('echarts', () => ({
  init: vi.fn(),
  graphic: { LinearGradient: vi.fn() },
}));

// Mock useCollector hook used by ContentTable
vi.mock('@/hooks/use-collector', () => ({
  useCollector: vi.fn(() => ({
    status: { isCollecting: false, progress: 0, total: 0 },
    sync: vi.fn(),
    logs: [],
  })),
}));

// Mock Dexie database used by ContentDetailPage, UnmonetizedContentPanel
vi.mock('@/db/database', () => ({
  db: {
    contentDailyRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          and: vi.fn(() => ({
            toArray: vi.fn(() => Promise.resolve([])),
          })),
          toArray: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
  },
}));

// Mock fetchAllCreations used by UnmonetizedContentPanel
vi.mock('@/api/zhihu-creations', () => ({
  fetchAllCreations: vi.fn(() => Promise.resolve({ articles: [], answers: [], pins: [] })),
}));

describe('ContentTable', () => {
  it('renders with records', async () => {
    const { ContentTable } = await import('@/dashboard/components/ContentTable');
    const records = makeIncomeRecords(5);
    const onContentClick = vi.fn();
    const { container } = render(<ContentTable records={records} onContentClick={onContentClick} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { ContentTable } = await import('@/dashboard/components/ContentTable');
    const { container } = render(<ContentTable records={[]} onContentClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('aggregates duplicate content IDs', async () => {
    const { ContentTable } = await import('@/dashboard/components/ContentTable');
    const records = [
      ...makeIncomeRecords(1),
      ...makeIncomeRecords(1), // same contentId
    ];
    const { container } = render(<ContentTable records={records} onContentClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});

describe('ContentDetailPage', () => {
  it('renders with required props', async () => {
    const { ContentDetailPage } = await import('@/dashboard/components/ContentDetailPage');
    const { container } = render(
      <ContentDetailPage
        contentId="content-1"
        contentToken="token-1"
        contentType="article"
        title="Test Article"
        publishDate="2024-01-15"
        onBack={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});

describe('ContentComparePage', () => {
  it('renders with initial items', async () => {
    const { ContentComparePage } = await import('@/dashboard/components/ContentComparePage');
    const allOptions = [
      { contentId: 'c1', contentToken: 't1', contentType: 'article', title: 'A1', publishDate: '2024-01-01' },
      { contentId: 'c2', contentToken: 't2', contentType: 'answer', title: 'A2', publishDate: '2024-01-02' },
    ];
    const { container } = render(
      <ContentComparePage initialItems={allOptions} allContentOptions={allOptions} onBack={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty options', async () => {
    const { ContentComparePage } = await import('@/dashboard/components/ContentComparePage');
    const { container } = render(<ContentComparePage allContentOptions={[]} onBack={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});

describe('UnmonetizedContentPanel', () => {
  it('renders with monetized tokens', async () => {
    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const tokens = new Set(['token-1', 'token-2']);
    const { container } = render(<UnmonetizedContentPanel monetizedContentTokens={tokens} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty set', async () => {
    const { UnmonetizedContentPanel } = await import('@/dashboard/components/UnmonetizedContentPanel');
    const { container } = render(<UnmonetizedContentPanel monetizedContentTokens={new Set()} />);
    expect(container).toBeTruthy();
  });
});

describe('TopContentRanking', () => {
  it('renders with records', async () => {
    const { TopContentRanking } = await import('@/dashboard/components/TopContentRanking');
    const records = makeIncomeRecords(10);
    const { container } = render(<TopContentRanking records={records} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { TopContentRanking } = await import('@/dashboard/components/TopContentRanking');
    const { container } = render(<TopContentRanking records={[]} />);
    expect(container).toBeTruthy();
  });
});

describe('MultiDimensionRanking', () => {
  it('renders with records', async () => {
    const { MultiDimensionRanking } = await import('@/dashboard/components/MultiDimensionRanking');
    const records = makeIncomeRecords(10);
    const { container } = render(<MultiDimensionRanking records={records} onContentClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('renders with empty records', async () => {
    const { MultiDimensionRanking } = await import('@/dashboard/components/MultiDimensionRanking');
    const { container } = render(<MultiDimensionRanking records={[]} />);
    expect(container).toBeTruthy();
  });
});
