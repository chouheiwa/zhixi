import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllCreations } from '@/api/zhihu-creations';
import { fetchWithRetry } from '@/api/fetch-proxy';
import type { ZhihuCreationsApiResponse } from '@/shared/api-types';

vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('@/shared/utils', () => ({
  randomDelay: vi.fn(() => Promise.resolve()),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeCreationItem(
  id: string,
  type: string,
  extra?: Partial<{
    title: string;
    excerpt: string;
    content: { type: 'text' | 'image'; own_text?: string; content?: string }[];
    read_count: number;
    vote_up_count: number;
    comment_count: number;
    collect_count: number;
    created_time: number;
  }>,
) {
  return {
    type,
    data: {
      id,
      url_token: `token-${id}`,
      title: extra?.title ?? `Title ${id}`,
      created_time: extra?.created_time ?? 1700000000,
      updated_time: 1700000000,
      content: extra?.content,
      excerpt: extra?.excerpt,
    },
    reaction: {
      read_count: extra?.read_count ?? 100,
      vote_up_count: extra?.vote_up_count ?? 10,
      comment_count: extra?.comment_count ?? 5,
      like_count: 3,
      collect_count: extra?.collect_count ?? 2,
      play_count: 0,
    },
  };
}

function makeApiResponse(
  items: ReturnType<typeof makeCreationItem>[],
  isEnd = true,
  totals?: number,
): ZhihuCreationsApiResponse {
  return {
    paging: {
      is_end: isEnd,
      totals: totals ?? items.length,
    },
    data: items,
  };
}

describe('fetchAllCreations', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single page and maps fields correctly', async () => {
    const items = [
      makeCreationItem('1', 'answer', { created_time: 1700000000 }),
      makeCreationItem('2', 'article', { title: 'My Article', created_time: 1700086400 }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      contentId: '1',
      contentToken: 'token-1',
      contentType: 'answer',
      readCount: 100,
      upvoteCount: 10,
      commentCount: 5,
      collectCount: 2,
    });
    expect(result[1]).toMatchObject({
      contentId: '2',
      contentToken: 'token-2',
      contentType: 'article',
      title: 'My Article',
    });
  });

  it('maps content type "answer" for unknown types', async () => {
    const items = [makeCreationItem('3', 'zvideo')];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    expect(result[0].contentType).toBe('answer');
  });

  it('maps content type "pin" for pin items', async () => {
    const items = [
      makeCreationItem('4', 'pin', {
        content: [
          { type: 'text', own_text: 'Hello world' },
          { type: 'image', url: 'https://example.com/img.jpg' },
        ],
      }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    expect(result[0].contentType).toBe('pin');
    expect(result[0].title).toBe('Hello world');
  });

  it('extracts pin title from multiple text blocks joined by space', async () => {
    const items = [
      makeCreationItem('5', 'pin', {
        content: [
          { type: 'text', own_text: 'First block' },
          { type: 'text', own_text: 'Second block' },
        ],
      }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    expect(result[0].title).toBe('First block Second block');
  });

  it('falls back to excerpt when pin has no text blocks', async () => {
    const items = [
      makeCreationItem('6', 'pin', {
        excerpt: 'Pin excerpt fallback',
        content: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    expect(result[0].title).toBe('Pin excerpt fallback');
  });

  it('falls back to "(无文字想法)" when pin has no text and no excerpt', async () => {
    const items = [
      makeCreationItem('7', 'pin', {
        content: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      }),
    ];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    expect(result[0].title).toBe('(无文字想法)');
  });

  it('formats publish date correctly from timestamp', async () => {
    // 2023-11-14 22:13:20 UTC → date depends on timezone, use a known UTC midnight
    // 1700000000 = 2023-11-14T22:13:20Z → local date depends on TZ
    // Use a timestamp that is clearly 2023-01-01 in UTC
    const ts = new Date('2023-06-15T00:00:00Z').getTime() / 1000;
    const items = [makeCreationItem('8', 'answer', { created_time: ts })];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    const result = await fetchAllCreations();
    // The date should be formatted as YYYY-MM-DD based on local time
    expect(result[0].publishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles pagination: fetches 2 pages until is_end', async () => {
    const page1Items = [makeCreationItem('a', 'answer'), makeCreationItem('b', 'answer')];
    const page2Items = [makeCreationItem('c', 'article')];

    mockFetchWithRetry
      .mockResolvedValueOnce(makeApiResponse(page1Items, false, 3))
      .mockResolvedValueOnce(makeApiResponse(page2Items, true, 3));

    const result = await fetchAllCreations();

    expect(result).toHaveLength(3);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);

    // Second call should include offset=2
    const secondCallUrl = mockFetchWithRetry.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('offset=2');
  });

  it('stops fetching when data array is empty', async () => {
    const page1Items = [makeCreationItem('x', 'answer')];

    mockFetchWithRetry
      .mockResolvedValueOnce(makeApiResponse(page1Items, false, 10))
      // Second page returns empty data
      .mockResolvedValueOnce({
        paging: { is_end: false, totals: 10 },
        data: [],
      } satisfies ZhihuCreationsApiResponse);

    const result = await fetchAllCreations();

    expect(result).toHaveLength(1);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress callback with correct values', async () => {
    const page1Items = [makeCreationItem('p1', 'answer'), makeCreationItem('p2', 'answer')];
    const page2Items = [makeCreationItem('p3', 'article')];

    mockFetchWithRetry
      .mockResolvedValueOnce(makeApiResponse(page1Items, false, 3))
      .mockResolvedValueOnce(makeApiResponse(page2Items, true, 3));

    const onProgress = vi.fn();
    const result = await fetchAllCreations(onProgress);

    expect(result).toHaveLength(3);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3);
  });

  it('does not call onProgress when no callback provided', async () => {
    const items = [makeCreationItem('q1', 'answer')];
    mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

    // Should not throw even with no callback
    await expect(fetchAllCreations()).resolves.toHaveLength(1);
  });

  describe('stopAt (incremental short-circuit)', () => {
    it('stops when a known contentId is encountered and omits it from the result', async () => {
      const page1Items = [
        makeCreationItem('new-1', 'answer'),
        makeCreationItem('new-2', 'article'),
        makeCreationItem('known-1', 'answer'),
        makeCreationItem('new-3', 'article'),
      ];
      mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(page1Items, false, 10));

      const result = await fetchAllCreations({ stopAt: new Set(['known-1']) });

      expect(result.map((r) => r.contentId)).toEqual(['new-1', 'new-2']);
      // Only one page fetched; no subsequent request
      expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    });

    it('falls through to multiple pages when no known id is seen', async () => {
      const page1 = [makeCreationItem('a', 'answer'), makeCreationItem('b', 'article')];
      const page2 = [makeCreationItem('c', 'answer')];
      mockFetchWithRetry
        .mockResolvedValueOnce(makeApiResponse(page1, false, 3))
        .mockResolvedValueOnce(makeApiResponse(page2, true, 3));

      const result = await fetchAllCreations({ stopAt: new Set(['not-in-result']) });

      expect(result).toHaveLength(3);
      expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    });

    it('behaves identically to the no-options form when stopAt is omitted', async () => {
      const items = [makeCreationItem('x', 'answer')];
      mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));

      const result = await fetchAllCreations({});
      expect(result).toHaveLength(1);
    });

    it('still accepts the legacy callback form as onProgress', async () => {
      const items = [makeCreationItem('y', 'answer')];
      mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(items));
      const progress = vi.fn();

      await fetchAllCreations(progress);

      expect(progress).toHaveBeenCalledWith(1, 1);
    });

    it('stops at the first known id even if later items on the page are unknown', async () => {
      const page1Items = [
        makeCreationItem('alpha', 'answer'),
        makeCreationItem('known-1', 'article'),
        makeCreationItem('beta', 'answer'),
      ];
      mockFetchWithRetry.mockResolvedValueOnce(makeApiResponse(page1Items, false, 5));

      const result = await fetchAllCreations({ stopAt: new Set(['known-1']) });
      expect(result.map((r) => r.contentId)).toEqual(['alpha']);
    });
  });

  it('reaction fields default to 0 when reaction is missing', async () => {
    const item = {
      type: 'answer',
      data: {
        id: 'no-reaction',
        url_token: 'token-no-reaction',
        title: 'No Reaction',
        created_time: 1700000000,
        updated_time: 1700000000,
      },
      reaction: undefined as unknown as {
        read_count: number;
        vote_up_count: number;
        comment_count: number;
        like_count: number;
        collect_count: number;
        play_count: number;
      },
    };
    mockFetchWithRetry.mockResolvedValueOnce({
      paging: { is_end: true, totals: 1 },
      data: [item],
    });

    const result = await fetchAllCreations();
    expect(result[0].readCount).toBe(0);
    expect(result[0].upvoteCount).toBe(0);
    expect(result[0].commentCount).toBe(0);
    expect(result[0].collectCount).toBe(0);
  });
});
