import { describe, it, expect, beforeEach } from 'vitest';
import { generateHtmlReport, type HtmlReportData } from '@/shared/html-report-generator';

function makeData(overrides: Partial<HtmlReportData> = {}): HtmlReportData {
  return {
    userName: 'TestUser',
    generatedAt: '2026-03-15T10:00:00.000Z',
    totalIncome: 123_45,
    contentCount: 42,
    dailyAvgIncome: 5_67,
    activeDays: 20,
    dailyTrend: [
      { date: '2026-03-01', income: 100 },
      { date: '2026-03-02', income: 250 },
      { date: '2026-03-03', income: 175 },
      { date: '2026-03-04', income: 320 },
    ],
    topContent: [
      { title: 'Top Answer', contentType: 'answer', income: 50_00, pv: 10000, rpm: 5_00 },
      { title: 'Pin Post', contentType: 'pin', income: 30_00, pv: 5000, rpm: 6_00 },
    ],
    rpmByType: [
      { type: 'answer', rpm: 5_00, count: 12 },
      { type: 'pin', rpm: 6_00, count: 8 },
    ],
    allContent: [
      { title: 'Answer A', contentType: 'answer', totalIncome: 10_00, totalPv: 2000, publishDate: '2026-01-15' },
      { title: 'Pin B', contentType: 'pin', totalIncome: 8_00, totalPv: 1500, publishDate: '2026-02-01' },
    ],
    ...overrides,
  };
}

describe('generateHtmlReport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a complete HTML document', () => {
    const html = generateHtmlReport(makeData());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('</html>');
  });

  it('embeds the user name and metadata', () => {
    const html = generateHtmlReport(makeData({ userName: 'Alice' }));
    expect(html).toContain('Alice 的创作数据报告');
    expect(html).toContain('生成时间：');
  });

  it('renders the overview stat cards with formatted values', () => {
    // Default currency unit is yuan → totalIncome 12345 fen → ¥123.45
    const html = generateHtmlReport(makeData());
    expect(html).toContain('累计收益');
    expect(html).toContain('¥123.45');
    expect(html).toContain('42 篇');
    expect(html).toContain('¥5.67');
    expect(html).toContain('20 天');
  });

  it('builds an SVG line chart when dailyTrend has data', () => {
    const html = generateHtmlReport(makeData());
    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');
  });

  it('shows a placeholder when dailyTrend is empty', () => {
    const html = generateHtmlReport(makeData({ dailyTrend: [] }));
    expect(html).toContain('暂无趋势数据');
  });

  it('renders the top content table rows', () => {
    const html = generateHtmlReport(makeData());
    expect(html).toContain('Top Answer');
    expect(html).toContain('Pin Post');
    // Top 10 section header
    expect(html).toContain('收益 Top 10');
  });

  it('renders the RPM-by-type analysis section', () => {
    const html = generateHtmlReport(makeData());
    expect(html).toContain('各类型 RPM 分析');
    // Each type should be mentioned
    expect(html).toContain('answer');
    expect(html).toContain('pin');
  });

  it('renders the full content table and reports its total count', () => {
    const html = generateHtmlReport(makeData());
    expect(html).toContain('有收益内容明细（2 篇）');
    expect(html).toContain('Answer A');
    expect(html).toContain('Pin B');
  });

  it('escapes HTML-special characters inside the rendered body', () => {
    const html = generateHtmlReport(
      makeData({
        userName: '<b>bold</b>',
        topContent: [{ title: 'Malicious "&" <tag>', contentType: 'answer', income: 1, pv: 1, rpm: 1 }],
      }),
    );
    // Body-rendered user strings must appear as entity-escaped versions.
    // (The inlined REPORT_DATA JSON block is not part of the escaped body
    // and is out of scope for this test.)
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;tag&gt;');
  });

  it('inlines the report data as JSON for client-side interaction', () => {
    const data = makeData();
    const html = generateHtmlReport(data);
    expect(html).toContain('const REPORT_DATA = ');
    expect(html).toContain(String(data.totalIncome));
  });

  it('respects the 盐粒 unit when configured in localStorage', () => {
    localStorage.setItem('zhixi-currency-unit', 'salt');
    const html = generateHtmlReport(makeData());
    // 12345 cents stays 12345 in salt display
    expect(html).toContain('12345盐粒');
    // No yuan prefix should be emitted in the overview when unit is salt
    expect(html).not.toContain('¥123.45');
  });

  it('handles an empty allContent list', () => {
    const html = generateHtmlReport(makeData({ allContent: [] }));
    expect(html).toContain('有收益内容明细（0 篇）');
  });
});
