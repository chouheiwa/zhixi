import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIncomeUrl, parseIncomeResponse } from '@/api/zhihu-income';

// Mock fetch-proxy
vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

// Mock shared/utils randomDelay
vi.mock('@/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/utils')>();
  return {
    ...actual,
    randomDelay: vi.fn(() => Promise.resolve()),
  };
});

// Mock date-utils
vi.mock('@/shared/date-utils', () => ({
  eachDayInRange: vi.fn((start: string, end: string) => {
    // Return days from start to end inclusive
    const days: string[] = [];
    const cur = new Date(start);
    const endDate = new Date(end);
    while (cur <= endDate) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }),
}));

describe('fetchCurrentUser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('maps API response fields to ZhihuUser', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockResolvedValueOnce({
      id: 'u-abc',
      url_token: 'my-token',
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    });

    const { fetchCurrentUser } = await import('@/api/zhihu-income');
    const user = await fetchCurrentUser();
    expect(user).toEqual({
      id: 'u-abc',
      urlToken: 'my-token',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
  });
});

describe('fetchDayIncome', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns records for a single page', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockResolvedValueOnce({
      total: 1,
      data: [
        {
          content_id: 'c1',
          content_token: 'tok1',
          content_title: 'Article 1',
          content_publish_at: 1000000,
          content_publish_date: '2024-01-01',
          current_read: 100,
          current_interaction: 5,
          current_income: 50,
          total_read: 100,
          total_interaction: 5,
          total_income: 50,
          content_type: 'article',
        },
      ],
    });

    const { fetchDayIncome } = await import('@/api/zhihu-income');
    const records = await fetchDayIncome('2024-01-01', 'user1');
    expect(records).not.toBeNull();
    expect(records!.length).toBe(1);
    expect(records![0].contentId).toBe('c1');
  });

  it('handles pagination - fetches multiple pages', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    // First page: returns 1 record with total=2
    vi.mocked(fetchWithRetry).mockResolvedValueOnce({
      total: 2,
      data: [
        {
          content_id: 'c1',
          content_token: 'tok1',
          content_title: 'Article 1',
          content_publish_at: 1000000,
          content_publish_date: '2024-01-01',
          current_read: 100,
          current_interaction: 5,
          current_income: 50,
          total_read: 100,
          total_interaction: 5,
          total_income: 50,
          content_type: 'article',
        },
      ],
    });
    // Second page: returns 1 record
    vi.mocked(fetchWithRetry).mockResolvedValueOnce({
      total: 2,
      data: [
        {
          content_id: 'c2',
          content_token: 'tok2',
          content_title: 'Article 2',
          content_publish_at: 1000001,
          content_publish_date: '2024-01-01',
          current_read: 200,
          current_interaction: 10,
          current_income: 100,
          total_read: 200,
          total_interaction: 10,
          total_income: 100,
          content_type: 'answer',
        },
      ],
    });

    const { fetchDayIncome } = await import('@/api/zhihu-income');
    const records = await fetchDayIncome('2024-01-01', 'user1');
    expect(records).not.toBeNull();
    expect(records!.length).toBe(2);
    expect(records![0].contentId).toBe('c1');
    expect(records![1].contentId).toBe('c2');
  });

  it('returns null when API returns 400 error', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockRejectedValueOnce(new Error('HTTP 400 Bad Request'));

    const { fetchDayIncome } = await import('@/api/zhihu-income');
    const records = await fetchDayIncome('2024-01-01', 'user1');
    expect(records).toBeNull();
  });

  it('re-throws non-400 errors', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockRejectedValueOnce(new Error('Network timeout'));

    const { fetchDayIncome } = await import('@/api/zhihu-income');
    await expect(fetchDayIncome('2024-01-01', 'user1')).rejects.toThrow('Network timeout');
  });

  it('breaks loop if records is empty (no data in page)', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    // total=5 but no data returned - should break
    vi.mocked(fetchWithRetry).mockResolvedValueOnce({
      total: 5,
      data: [],
    });

    const { fetchDayIncome } = await import('@/api/zhihu-income');
    const records = await fetchDayIncome('2024-01-01', 'user1');
    expect(records).not.toBeNull();
    expect(records!.length).toBe(0);
  });
});

describe('fetchDateRangeIncome', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('fetches all days in range', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    // Called for each day: 3 days
    vi.mocked(fetchWithRetry).mockResolvedValue({
      total: 1,
      data: [
        {
          content_id: 'c1',
          content_token: 'tok1',
          content_title: 'Article',
          content_publish_at: 1000000,
          content_publish_date: '2024-01-01',
          current_read: 100,
          current_interaction: 5,
          current_income: 50,
          total_read: 100,
          total_interaction: 5,
          total_income: 50,
          content_type: 'article',
        },
      ],
    });

    const { fetchDateRangeIncome } = await import('@/api/zhihu-income');
    const records = await fetchDateRangeIncome('2024-01-01', '2024-01-03', 'user1');
    // 3 days, 1 record each → 3 records
    expect(records.length).toBe(3);
  });

  it('skips dates when shouldSkipDate returns true', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockResolvedValue({
      total: 1,
      data: [
        {
          content_id: 'c1',
          content_token: 'tok1',
          content_title: 'Article',
          content_publish_at: 1000000,
          content_publish_date: '2024-01-01',
          current_read: 100,
          current_interaction: 5,
          current_income: 50,
          total_read: 100,
          total_interaction: 5,
          total_income: 50,
          content_type: 'article',
        },
      ],
    });

    const { fetchDateRangeIncome } = await import('@/api/zhihu-income');
    const shouldSkipDate = vi.fn(async (date: string) => date === '2024-01-02');
    const records = await fetchDateRangeIncome('2024-01-01', '2024-01-03', 'user1', { shouldSkipDate });
    // 3 days total, 1 skipped → 2 calls to fetchWithRetry → 2 records
    expect(records.length).toBe(2);
  });

  it('calls onProgress for each day', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockResolvedValue({
      total: 1,
      data: [
        {
          content_id: 'c1',
          content_token: 'tok1',
          content_title: 'Article',
          content_publish_at: 1000000,
          content_publish_date: '2024-01-01',
          current_read: 100,
          current_interaction: 5,
          current_income: 50,
          total_read: 100,
          total_interaction: 5,
          total_income: 50,
          content_type: 'article',
        },
      ],
    });

    const { fetchDateRangeIncome } = await import('@/api/zhihu-income');
    const onProgress = vi.fn();
    await fetchDateRangeIncome('2024-01-01', '2024-01-02', 'user1', { onProgress });
    // 2 days → onProgress called twice
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress with skipped=true when date is skipped', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockResolvedValue({
      total: 0,
      data: [],
    });

    const { fetchDateRangeIncome } = await import('@/api/zhihu-income');
    const onProgress = vi.fn();
    const shouldSkipDate = vi.fn(async () => true);
    await fetchDateRangeIncome('2024-01-01', '2024-01-02', 'user1', { shouldSkipDate, onProgress });
    // All skipped → onProgress called with skipped=true
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][3]).toBe(true);
    expect(onProgress.mock.calls[1][3]).toBe(true);
  });

  it('handles null return from fetchDayIncome (400 error)', async () => {
    const { fetchWithRetry } = await import('@/api/fetch-proxy');
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('HTTP 400 Bad Request'));

    const { fetchDateRangeIncome } = await import('@/api/zhihu-income');
    const records = await fetchDateRangeIncome('2024-01-01', '2024-01-02', 'user1');
    // Both days return null (400 error) → no records
    expect(records.length).toBe(0);
  });
});

describe('buildIncomeUrl', () => {
  it('builds correct URL with date range and pagination', () => {
    const url = buildIncomeUrl('2026-03-20', '2026-03-27', 1, 20);
    expect(url).toBe(
      'https://www.zhihu.com/api/v4/creators/text/income/income/range?start_date=2026-03-20&end_date=2026-03-27&order_field=content_publish_at&order_sort=desc&page=1&page_size=20',
    );
  });
});

describe('parseIncomeResponse', () => {
  it('converts API response to IncomeRecord array', () => {
    const apiData = {
      total: 1,
      data: [
        {
          content_id: '774741995',
          content_token: '2020438359206541170',
          content_title: '测试文章',
          content_publish_at: 1774490042,
          content_publish_date: '2026-03-26',
          current_read: 240,
          current_interaction: 8,
          current_income: 83,
          total_read: 240,
          total_interaction: 8,
          total_income: 83,
          content_type: 'answer',
        },
      ],
    };
    const records = parseIncomeResponse(apiData, '2026-03-27', 'user123');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      contentId: '774741995',
      contentToken: '2020438359206541170',
      title: '测试文章',
      contentType: 'answer',
      publishDate: '2026-03-26',
      recordDate: '2026-03-27',
      currentRead: 240,
      currentIncome: 83,
    });
    expect(records[0].collectedAt).toBeGreaterThan(0);
  });

  it('returns empty array for empty response', () => {
    const records = parseIncomeResponse({ total: 0, data: [] }, '2026-03-27', 'user123');
    expect(records).toEqual([]);
  });
});
