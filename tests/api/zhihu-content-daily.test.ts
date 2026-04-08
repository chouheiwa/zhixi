import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContentDaily, parseContentDailyResponse } from '@/api/zhihu-content-daily';
import { fetchWithRetry } from '@/api/fetch-proxy';
import type { ZhihuContentDailyApiItem, ZhihuContentDailyApiResponse } from '@/shared/api-types';

vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

const CONTENT_DAILY_API = 'https://www.zhihu.com/api/v4/creators/analysis/realtime/content/daily';

function makeDailyItem(date: string, overrides?: Partial<ZhihuContentDailyApiItem>): ZhihuContentDailyApiItem {
  return {
    p_date: date,
    pv: 100,
    show: 200,
    upvote: 10,
    comment: 5,
    like: 3,
    collect: 2,
    share: 1,
    play: 0,
    ...overrides,
  };
}

describe('fetchContentDaily', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('constructs the correct URL with all query params', async () => {
    const mockResponse: ZhihuContentDailyApiResponse = [];
    mockFetchWithRetry.mockResolvedValueOnce(mockResponse);

    await fetchContentDaily('answer', 'my-token', '2024-01-01', '2024-01-31');

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;

    expect(calledUrl).toContain(CONTENT_DAILY_API);
    expect(calledUrl).toContain('type=answer');
    expect(calledUrl).toContain('token=my-token');
    expect(calledUrl).toContain('start=2024-01-01');
    expect(calledUrl).toContain('end=2024-01-31');
  });

  it('constructs URL correctly for article type', async () => {
    mockFetchWithRetry.mockResolvedValueOnce([]);

    await fetchContentDaily('article', 'article-token', '2024-03-01', '2024-03-31');

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain('type=article');
    expect(calledUrl).toContain('token=article-token');
  });

  it('constructs URL correctly for pin type', async () => {
    mockFetchWithRetry.mockResolvedValueOnce([]);

    await fetchContentDaily('pin', 'pin-token', '2024-02-01', '2024-02-28');

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain('type=pin');
    expect(calledUrl).toContain('token=pin-token');
  });

  it('returns the raw API response from fetchWithRetry', async () => {
    const mockResponse: ZhihuContentDailyApiResponse = [
      makeDailyItem('2024-01-01'),
      makeDailyItem('2024-01-02', { pv: 250 }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(mockResponse);

    const result = await fetchContentDaily('answer', 'token', '2024-01-01', '2024-01-02');
    expect(result).toEqual(mockResponse);
  });

  it('returns empty array when API returns empty', async () => {
    mockFetchWithRetry.mockResolvedValueOnce([]);

    const result = await fetchContentDaily('answer', 'token', '2024-01-01', '2024-01-31');
    expect(result).toEqual([]);
  });
});

describe('parseContentDailyResponse', () => {
  it('maps API items to ContentDailyRecord array correctly', () => {
    const items: ZhihuContentDailyApiResponse = [
      makeDailyItem('2024-01-01', { pv: 150, show: 300, upvote: 20 }),
      makeDailyItem('2024-01-02', { pv: 200, show: 400, comment: 8 }),
    ];

    const result = parseContentDailyResponse(
      items,
      'user-123',
      'content-token',
      'content-id-456',
      'answer',
      'My Answer Title',
    );

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      userId: 'user-123',
      contentToken: 'content-token',
      contentId: 'content-id-456',
      contentType: 'answer',
      title: 'My Answer Title',
      date: '2024-01-01',
      pv: 150,
      show: 300,
      upvote: 20,
      comment: 5,
      like: 3,
      collect: 2,
      share: 1,
      play: 0,
    });

    expect(result[1]).toMatchObject({
      date: '2024-01-02',
      pv: 200,
      show: 400,
      comment: 8,
    });
  });

  it('includes collectedAt timestamp as a number', () => {
    const before = Date.now();
    const items: ZhihuContentDailyApiResponse = [makeDailyItem('2024-01-01')];

    const result = parseContentDailyResponse(items, 'user-1', 'tok', 'id-1', 'article', 'Title');

    const after = Date.now();
    expect(result[0].collectedAt).toBeGreaterThanOrEqual(before);
    expect(result[0].collectedAt).toBeLessThanOrEqual(after);
  });

  it('returns empty array when given empty input', () => {
    const result = parseContentDailyResponse([], 'user-1', 'tok', 'id-1', 'article', 'Title');
    expect(result).toEqual([]);
  });

  it('maps all metric fields from API item', () => {
    const item = makeDailyItem('2024-06-01', {
      pv: 999,
      show: 888,
      upvote: 77,
      comment: 66,
      like: 55,
      collect: 44,
      share: 33,
      play: 22,
    });

    const result = parseContentDailyResponse([item], 'u', 't', 'i', 'article', 'T');

    expect(result[0]).toMatchObject({
      pv: 999,
      show: 888,
      upvote: 77,
      comment: 66,
      like: 55,
      collect: 44,
      share: 33,
      play: 22,
    });
  });

  it('applies the same userId/contentToken/contentId to all records', () => {
    const items: ZhihuContentDailyApiResponse = [
      makeDailyItem('2024-01-01'),
      makeDailyItem('2024-01-02'),
      makeDailyItem('2024-01-03'),
    ];

    const result = parseContentDailyResponse(items, 'user-xyz', 'token-abc', 'id-def', 'pin', 'My Pin');

    for (const record of result) {
      expect(record.userId).toBe('user-xyz');
      expect(record.contentToken).toBe('token-abc');
      expect(record.contentId).toBe('id-def');
      expect(record.contentType).toBe('pin');
      expect(record.title).toBe('My Pin');
    }
  });
});
