import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRealtimeAggr, fetchTodayRealtime } from '@/api/zhihu-realtime';
import { fetchWithRetry } from '@/api/fetch-proxy';
import type { ZhihuRealtimeAggrItem, ZhihuRealtimeAggrResponse } from '@/shared/api-types';

vi.mock('@/api/fetch-proxy', () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeAggrItem(overrides?: Partial<ZhihuRealtimeAggrItem>): ZhihuRealtimeAggrItem {
  return {
    updated: null,
    pv: 0,
    play: 0,
    show: 0,
    upvote: 0,
    comment: 0,
    like: 0,
    collect: 0,
    share: 0,
    reaction: 0,
    re_pin: 0,
    like_and_reaction: 0,
    new_upvote: 0,
    new_like: 0,
    new_incr_upvote_num: 0,
    new_desc_upvote_num: 0,
    new_incr_like_num: 0,
    new_desc_like_num: 0,
    ...overrides,
  };
}

function makeAggrResponse(
  overrides?: Partial<ZhihuRealtimeAggrItem>,
  options?: { updated?: string; today?: Partial<ZhihuRealtimeAggrItem>; yesterday?: Partial<ZhihuRealtimeAggrItem> },
): ZhihuRealtimeAggrResponse {
  const base = makeAggrItem(overrides);
  return {
    ...base,
    updated: options?.updated ?? '2024-06-15 10:00:00',
    today: makeAggrItem(options?.today),
    yesterday: makeAggrItem(options?.yesterday),
  };
}

describe('fetchRealtimeAggr', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed data with updatedAt on success', async () => {
    const resp = makeAggrResponse({ pv: 1000, show: 5000, upvote: 50 }, { updated: '2024-06-15 12:00:00' });
    mockFetchWithRetry.mockResolvedValueOnce(resp);

    const result = await fetchRealtimeAggr('2024-06-15');

    expect(result).not.toBeNull();
    expect(result!.data.pv).toBe(1000);
    expect(result!.data.show).toBe(5000);
    expect(result!.data.upvote).toBe(50);
    expect(result!.updatedAt).toBe('2024-06-15 12:00:00');
  });

  it('maps all snake_case fields to camelCase', async () => {
    const resp = makeAggrResponse({
      pv: 1,
      play: 2,
      show: 3,
      upvote: 4,
      comment: 5,
      like: 6,
      collect: 7,
      share: 8,
      reaction: 9,
      re_pin: 10,
      like_and_reaction: 11,
      new_upvote: 12,
      new_like: 13,
      new_incr_upvote_num: 14,
      new_desc_upvote_num: 15,
      new_incr_like_num: 16,
      new_desc_like_num: 17,
    });
    mockFetchWithRetry.mockResolvedValueOnce(resp);

    const result = await fetchRealtimeAggr('2024-06-15');

    expect(result!.data).toMatchObject({
      pv: 1,
      play: 2,
      show: 3,
      upvote: 4,
      comment: 5,
      like: 6,
      collect: 7,
      share: 8,
      reaction: 9,
      rePin: 10,
      likeAndReaction: 11,
      newUpvote: 12,
      newLike: 13,
      newIncrUpvoteNum: 14,
      newDescUpvoteNum: 15,
      newIncrLikeNum: 16,
      newDescLikeNum: 17,
    });
  });

  it('defaults missing fields to 0', async () => {
    const resp = makeAggrResponse();
    // Simulate nullish fields by overriding after creation
    const respWithNulls = {
      ...resp,
      pv: undefined as unknown as number,
      re_pin: undefined as unknown as number,
      like_and_reaction: null as unknown as number,
    };
    mockFetchWithRetry.mockResolvedValueOnce(respWithNulls);

    const result = await fetchRealtimeAggr('2024-06-15');

    expect(result!.data.pv).toBe(0);
    expect(result!.data.rePin).toBe(0);
    expect(result!.data.likeAndReaction).toBe(0);
  });

  it('uses empty string for updatedAt when resp.updated is missing', async () => {
    const resp = makeAggrResponse();
    const respNoUpdated = { ...resp, updated: undefined as unknown as string };
    mockFetchWithRetry.mockResolvedValueOnce(respNoUpdated);

    const result = await fetchRealtimeAggr('2024-06-15');

    expect(result!.updatedAt).toBe('');
  });

  it('constructs the correct URL with date param', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeAggrResponse());

    await fetchRealtimeAggr('2024-06-15');

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain('start=2024-06-15');
    expect(calledUrl).toContain('end=2024-06-15');
    expect(calledUrl).toContain('tab=all');
  });

  it('returns null on error', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchRealtimeAggr('2024-06-15');
    expect(result).toBeNull();
  });

  it('returns null on API error response', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await fetchRealtimeAggr('2024-06-15');
    expect(result).toBeNull();
  });
});

describe('fetchTodayRealtime', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns today and yesterday data on success', async () => {
    const resp = makeAggrResponse(
      {},
      {
        updated: '2024-06-15 14:00:00',
        today: { pv: 500, upvote: 30, re_pin: 5 },
        yesterday: { pv: 800, upvote: 50, like: 20 },
      },
    );
    mockFetchWithRetry.mockResolvedValueOnce(resp);

    const result = await fetchTodayRealtime('2024-06-15');

    expect(result).not.toBeNull();
    expect(result!.today.pv).toBe(500);
    expect(result!.today.upvote).toBe(30);
    expect(result!.today.rePin).toBe(5);
    expect(result!.today.updatedAt).toBe('2024-06-15 14:00:00');

    expect(result!.yesterday.pv).toBe(800);
    expect(result!.yesterday.upvote).toBe(50);
    expect(result!.yesterday.like).toBe(20);
  });

  it('maps snake_case to camelCase for both today and yesterday', async () => {
    const resp = makeAggrResponse(
      {},
      {
        today: {
          re_pin: 7,
          like_and_reaction: 15,
          new_incr_upvote_num: 3,
          new_desc_upvote_num: 1,
          new_incr_like_num: 4,
          new_desc_like_num: 2,
        },
        yesterday: {
          re_pin: 9,
          like_and_reaction: 20,
        },
      },
    );
    mockFetchWithRetry.mockResolvedValueOnce(resp);

    const result = await fetchTodayRealtime('2024-06-15');

    expect(result!.today.rePin).toBe(7);
    expect(result!.today.likeAndReaction).toBe(15);
    expect(result!.today.newIncrUpvoteNum).toBe(3);
    expect(result!.today.newDescUpvoteNum).toBe(1);
    expect(result!.today.newIncrLikeNum).toBe(4);
    expect(result!.today.newDescLikeNum).toBe(2);

    expect(result!.yesterday.rePin).toBe(9);
    expect(result!.yesterday.likeAndReaction).toBe(20);
  });

  it('falls back to root resp fields when today/yesterday are absent', async () => {
    const resp = makeAggrResponse({ pv: 999, upvote: 88 }, { updated: '2024-06-15 10:00:00' });
    // Remove today and yesterday to test fallback
    const respNoSub = {
      ...resp,
      today: undefined as unknown as ZhihuRealtimeAggrItem,
      yesterday: undefined as unknown as ZhihuRealtimeAggrItem,
    };
    mockFetchWithRetry.mockResolvedValueOnce(respNoSub);

    const result = await fetchTodayRealtime('2024-06-15');

    expect(result).not.toBeNull();
    // Falls back to root resp (pv=999, upvote=88)
    expect(result!.today.pv).toBe(999);
    expect(result!.today.upvote).toBe(88);
    expect(result!.today.updatedAt).toBe('2024-06-15 10:00:00');

    expect(result!.yesterday.pv).toBe(999);
    expect(result!.yesterday.upvote).toBe(88);
  });

  it('includes updatedAt in today result', async () => {
    const resp = makeAggrResponse({}, { updated: '2024-06-15 08:30:00', today: { pv: 100 } });
    mockFetchWithRetry.mockResolvedValueOnce(resp);

    const result = await fetchTodayRealtime('2024-06-15');
    expect(result!.today.updatedAt).toBe('2024-06-15 08:30:00');
  });

  it('returns empty updatedAt string when resp.updated is missing', async () => {
    const resp = makeAggrResponse({}, { today: {}, yesterday: {} });
    const respNoUpdated = { ...resp, updated: undefined as unknown as string };
    mockFetchWithRetry.mockResolvedValueOnce(respNoUpdated);

    const result = await fetchTodayRealtime('2024-06-15');
    expect(result!.today.updatedAt).toBe('');
  });

  it('constructs the correct URL with today date', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeAggrResponse());

    await fetchTodayRealtime('2024-06-15');

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain('start=2024-06-15');
    expect(calledUrl).toContain('end=2024-06-15');
    expect(calledUrl).toContain('tab=all');
  });

  it('returns null on network error', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchTodayRealtime('2024-06-15');
    expect(result).toBeNull();
  });

  it('returns null on API exception', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await fetchTodayRealtime('2024-06-15');
    expect(result).toBeNull();
  });

  it('defaults missing fields in today/yesterday to 0', async () => {
    const resp = makeAggrResponse({}, { today: {}, yesterday: {} });
    const respWithNulls = {
      ...resp,
      today: {
        ...resp.today,
        pv: null as unknown as number,
        re_pin: undefined as unknown as number,
      },
      yesterday: {
        ...resp.yesterday,
        upvote: null as unknown as number,
      },
    };
    mockFetchWithRetry.mockResolvedValueOnce(respWithNulls);

    const result = await fetchTodayRealtime('2024-06-15');
    expect(result!.today.pv).toBe(0);
    expect(result!.today.rePin).toBe(0);
    expect(result!.yesterday.upvote).toBe(0);
  });
});
