/**
 * Fetch all user-published content from Zhihu creator API.
 * Supports pagination.
 */

import type { ZhihuCreationsApiResponse } from '@/shared/api-types';
import { proxyFetch } from './fetch-proxy';

const CREATIONS_API = 'https://www.zhihu.com/api/v4/creators/creations/v2/all';

export interface CreationItem {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
  readCount: number;
  upvoteCount: number;
  commentCount: number;
  collectCount: number;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Fetch all creations with pagination.
 */
export async function fetchAllCreations(
  onProgress?: (fetched: number, total: number) => void,
): Promise<CreationItem[]> {
  const limit = 50;
  let offset = 0;
  let total = 0;
  const items: CreationItem[] = [];

  do {
    const url = `${CREATIONS_API}?start=0&end=0&limit=${limit}&offset=${offset}&need_co_creation=1&sort_type=created`;
    const resp = await proxyFetch<ZhihuCreationsApiResponse>(url);

    total = resp.paging.totals;

    for (const item of resp.data) {
      items.push({
        contentId: item.data.id,
        contentToken: item.data.url_token,
        contentType: item.type === 'article' ? 'article' : 'answer',
        title: item.data.title,
        publishDate: formatTimestamp(item.data.created_time),
        readCount: item.reaction?.read_count ?? 0,
        upvoteCount: item.reaction?.vote_up_count ?? 0,
        commentCount: item.reaction?.comment_count ?? 0,
        collectCount: item.reaction?.collect_count ?? 0,
      });
    }

    offset += resp.data.length;
    onProgress?.(items.length, total);

    if (resp.paging.is_end || resp.data.length === 0) break;

    // Small delay between pages
    await new Promise((r) => setTimeout(r, 500));
  } while (offset < total);

  return items;
}
