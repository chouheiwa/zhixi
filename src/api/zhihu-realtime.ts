/**
 * Fetch daily aggregated realtime metrics from Zhihu creator API.
 * Endpoint: /api/v4/creators/analysis/realtime/member/aggr
 */

import { proxyFetch } from './fetch-proxy';

interface RawRealtimeAggr {
  updated: string | null;
  pv: number;
  play: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  reaction: number;
  re_pin: number;
  like_and_reaction: number;
  new_upvote: number;
  new_like: number;
  new_incr_upvote_num: number;
  new_desc_upvote_num: number;
  new_incr_like_num: number;
  new_desc_like_num: number;
}

export interface RealtimeAggrResponse {
  today: RawRealtimeAggr;
  yesterday: RawRealtimeAggr;
  updated: string;
  pv: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  play: number;
  reaction: number;
  re_pin: number;
  like_and_reaction: number;
  new_upvote: number;
  new_like: number;
  new_incr_upvote_num: number;
  new_desc_upvote_num: number;
  new_incr_like_num: number;
  new_desc_like_num: number;
}

function parseRaw(raw: RawRealtimeAggr) {
  return {
    pv: raw.pv ?? 0,
    play: raw.play ?? 0,
    show: raw.show ?? 0,
    upvote: raw.upvote ?? 0,
    comment: raw.comment ?? 0,
    like: raw.like ?? 0,
    collect: raw.collect ?? 0,
    share: raw.share ?? 0,
    reaction: raw.reaction ?? 0,
    rePin: raw.re_pin ?? 0,
    likeAndReaction: raw.like_and_reaction ?? 0,
    newUpvote: raw.new_upvote ?? 0,
    newLike: raw.new_like ?? 0,
    newIncrUpvoteNum: raw.new_incr_upvote_num ?? 0,
    newDescUpvoteNum: raw.new_desc_upvote_num ?? 0,
    newIncrLikeNum: raw.new_incr_like_num ?? 0,
    newDescLikeNum: raw.new_desc_like_num ?? 0,
  };
}

/**
 * Fetch realtime aggregated data for a single date.
 */
export async function fetchRealtimeAggr(date: string): Promise<{
  data: ReturnType<typeof parseRaw>;
  updatedAt: string;
} | null> {
  try {
    const url = `https://www.zhihu.com/api/v4/creators/analysis/realtime/member/aggr?tab=all&start=${date}&end=${date}`;
    const resp = await proxyFetch<RealtimeAggrResponse>(url);
    return {
      data: parseRaw(resp),
      updatedAt: resp.updated ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch today's realtime data (returns today + yesterday).
 */
export async function fetchTodayRealtime(today: string): Promise<{
  today: ReturnType<typeof parseRaw> & { updatedAt: string };
  yesterday: ReturnType<typeof parseRaw>;
} | null> {
  try {
    const url = `https://www.zhihu.com/api/v4/creators/analysis/realtime/member/aggr?tab=all&start=${today}&end=${today}`;
    const resp = await proxyFetch<RealtimeAggrResponse>(url);
    return {
      today: { ...parseRaw(resp.today ?? resp), updatedAt: resp.updated ?? '' },
      yesterday: parseRaw(resp.yesterday ?? resp),
    };
  } catch {
    return null;
  }
}
