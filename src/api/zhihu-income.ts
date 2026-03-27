import { ZHIHU_INCOME_API, DEFAULT_PAGE_SIZE, REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX } from '@/shared/constants';
import type { IncomeRecord } from '@/shared/types';
import { proxyFetch } from './fetch-proxy';

interface IncomeApiItem {
  content_id: string;
  content_token: string;
  content_title: string;
  content_publish_at: number;
  content_publish_date: string;
  current_read: number;
  current_interaction: number;
  current_income: number;
  total_read: number;
  total_interaction: number;
  total_income: number;
  content_type: string;
}

interface IncomeApiResponse {
  total: number;
  data: IncomeApiItem[];
}

export function buildIncomeUrl(
  startDate: string, endDate: string, page: number, pageSize: number = DEFAULT_PAGE_SIZE
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

export function parseIncomeResponse(apiData: IncomeApiResponse, recordDate: string): IncomeRecord[] {
  return apiData.data.map((item) => ({
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

function randomDelay(): Promise<void> {
  const ms = REQUEST_INTERVAL_MIN + Math.random() * (REQUEST_INTERVAL_MAX - REQUEST_INTERVAL_MIN);
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchDayIncome(date: string): Promise<IncomeRecord[]> {
  const allRecords: IncomeRecord[] = [];
  let page = 1;
  let total = Infinity;

  while (allRecords.length < total) {
    const url = buildIncomeUrl(date, date, page);
    const data = await proxyFetch<IncomeApiResponse>(url);
    total = data.total;
    const records = parseIncomeResponse(data, date);
    allRecords.push(...records);
    if (records.length === 0) break;
    page++;
    await randomDelay();
  }

  return allRecords;
}

export async function fetchDateRangeIncome(
  startDate: string,
  endDate: string,
  onProgress?: (completedDate: string, current: number, total: number) => void
): Promise<IncomeRecord[]> {
  const { eachDayInRange } = await import('@/shared/date-utils');
  const days = eachDayInRange(startDate, endDate);
  const allRecords: IncomeRecord[] = [];

  for (let i = 0; i < days.length; i++) {
    if (i > 0) await randomDelay();
    const dayRecords = await fetchDayIncome(days[i]);
    allRecords.push(...dayRecords);
    onProgress?.(days[i], i + 1, days.length);
  }

  return allRecords;
}
