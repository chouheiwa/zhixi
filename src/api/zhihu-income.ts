import { ZHIHU_INCOME_API, DEFAULT_PAGE_SIZE, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX } from '@/shared/constants';
import { randomDelay } from '@/shared/utils';
import type { IncomeRecord, ZhihuUser } from '@/shared/types';
import type { ZhihuIncomeApiResponse } from '@/shared/api-types';
import { fetchWithRetry } from './fetch-proxy';

interface MeApiResponse {
  id: string;
  url_token: string;
  name: string;
  avatar_url: string;
}

export async function fetchCurrentUser(): Promise<ZhihuUser> {
  const data = await fetchWithRetry<MeApiResponse>('https://www.zhihu.com/api/v4/me');
  return {
    id: data.id,
    urlToken: data.url_token,
    name: data.name,
    avatarUrl: data.avatar_url,
  };
}

export function buildIncomeUrl(
  startDate: string,
  endDate: string,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    order_field: 'content_publish_at',
    order_sort: 'desc',
    page: String(page),
    page_size: String(pageSize),
  });
  return `${ZHIHU_INCOME_API}?${params}`;
}

export function parseIncomeResponse(
  apiData: ZhihuIncomeApiResponse,
  recordDate: string,
  userId: string,
): IncomeRecord[] {
  return apiData.data.map((item) => ({
    userId,
    contentId: item.content_id,
    contentToken: item.content_token,
    title: item.content_title,
    contentType: item.content_type,
    publishDate: item.content_publish_date,
    recordDate,
    currentRead: item.current_read,
    currentInteraction: item.current_interaction,
    currentIncome: item.current_income,
    totalRead: item.total_read,
    totalInteraction: item.total_interaction,
    totalIncome: item.total_income,
    collectedAt: Date.now(),
  }));
}

/**
 * Fetch all income records for a single day (handles pagination).
 * Returns null if the API returns 400 (e.g. today's data not available).
 */
export async function fetchDayIncome(date: string, userId: string): Promise<IncomeRecord[] | null> {
  const allRecords: IncomeRecord[] = [];
  let page = 1;
  let total = Infinity;

  while (allRecords.length < total) {
    const url = buildIncomeUrl(date, date, page);
    let data: ZhihuIncomeApiResponse;
    try {
      data = await fetchWithRetry<ZhihuIncomeApiResponse>(url);
    } catch (err) {
      // If API returns HTTP 400 (e.g. today's data not yet available), skip gracefully
      if (err instanceof Error && err.message.includes('400')) {
        return null;
      }
      throw err;
    }
    total = data.total;
    const records = parseIncomeResponse(data, date, userId);
    allRecords.push(...records);
    if (records.length === 0) break;
    page++;
    await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);
  }

  return allRecords;
}

/**
 * Fetch income for a date range in reverse order (newest first).
 * Skips dates that already have data (via shouldSkipDate callback).
 * Gracefully handles 400 errors by skipping that date.
 */
export async function fetchDateRangeIncome(
  startDate: string,
  endDate: string,
  userId: string,
  options?: {
    shouldSkipDate?: (date: string) => Promise<boolean>;
    onProgress?: (completedDate: string, current: number, total: number, skipped: boolean) => void;
  },
): Promise<IncomeRecord[]> {
  const { eachDayInRange } = await import('@/shared/date-utils');
  const days = eachDayInRange(startDate, endDate).reverse(); // newest first
  const allRecords: IncomeRecord[] = [];

  for (let i = 0; i < days.length; i++) {
    // Check if we should skip this date
    if (options?.shouldSkipDate) {
      const skip = await options.shouldSkipDate(days[i]);
      if (skip) {
        options?.onProgress?.(days[i], i + 1, days.length, true);
        continue;
      }
    }

    if (i > 0) await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);

    const dayRecords = await fetchDayIncome(days[i], userId);
    if (dayRecords !== null) {
      allRecords.push(...dayRecords);
    }
    options?.onProgress?.(days[i], i + 1, days.length, false);
  }

  return allRecords;
}
