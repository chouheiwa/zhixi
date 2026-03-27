import { describe, it, expect } from 'vitest';
import { buildIncomeUrl, parseIncomeResponse } from '@/api/zhihu-income';

describe('buildIncomeUrl', () => {
  it('builds correct URL with date range and pagination', () => {
    const url = buildIncomeUrl('2026-03-20', '2026-03-27', 1, 20);
    expect(url).toBe(
      'https://www.zhihu.com/api/v4/creators/text/income/income/range?start_date=2026-03-20&end_date=2026-03-27&order_field=content_publish_at&order_sort=desc&page=1&page_size=20'
    );
  });
});

describe('parseIncomeResponse', () => {
  it('converts API response to IncomeRecord array', () => {
    const apiData = {
      total: 1,
      data: [{
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
      }],
    };
    const records = parseIncomeResponse(apiData, '2026-03-27');
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
    const records = parseIncomeResponse({ total: 0, data: [] }, '2026-03-27');
    expect(records).toEqual([]);
  });
});
