import { fetchWithRetry } from './fetch-proxy';
import type { ZhihuContentDailyApiResponse } from '@/shared/api-types';
import type { ContentDailyRecord } from '@/shared/types';

const CONTENT_DAILY_API = 'https://www.zhihu.com/api/v4/creators/analysis/realtime/content/daily';

export async function fetchContentDaily(
  contentType: string,
  contentToken: string,
  startDate: string,
  endDate: string,
): Promise<ZhihuContentDailyApiResponse> {
  const params = new URLSearchParams({
    type: contentType,
    token: contentToken,
    start: startDate,
    end: endDate,
  });
  return fetchWithRetry<ZhihuContentDailyApiResponse>(`${CONTENT_DAILY_API}?${params}`);
}

export function parseContentDailyResponse(
  items: Awaited<ReturnType<typeof fetchContentDaily>>,
  userId: string,
  contentToken: string,
  contentId: string,
  contentType: string,
  title: string,
): ContentDailyRecord[] {
  return items.map((item) => ({
    userId,
    contentToken,
    contentId,
    contentType,
    title,
    date: item.p_date,
    pv: item.pv,
    show: item.show,
    upvote: item.upvote,
    comment: item.comment,
    like: item.like,
    collect: item.collect,
    share: item.share,
    play: item.play,
    collectedAt: Date.now(),
  }));
}
