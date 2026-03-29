import * as XLSX from 'xlsx';
import type { DailySummary, IncomeRecord } from '@/shared/types';

interface ExportParams {
  userName: string;
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

export function generateExcelReport({ userName, allSummaries, allRecords }: ExportParams): void {
  const wb = XLSX.utils.book_new();

  const totalIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0) / 100;
  const totalRead = allSummaries.reduce((s, d) => s + d.totalRead, 0);
  const days = allSummaries.length;

  const contentMap = new Map<string, { type: string; income: number; read: number; interaction: number }>();
  for (const r of allRecords) {
    const existing = contentMap.get(r.contentId);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.interaction += r.currentInteraction;
    } else {
      contentMap.set(r.contentId, { type: r.contentType, income: r.currentIncome, read: r.currentRead, interaction: r.currentInteraction });
    }
  }
  const contentCount = contentMap.size;
  const articleCount = Array.from(contentMap.values()).filter(c => c.type === 'article').length;
  const answerCount = contentCount - articleCount;

  // Sheet 1: Summary
  const summaryData = [
    ['指标', '值'],
    ['数据范围', allSummaries.length > 0 ? `${allSummaries[0].date} ~ ${allSummaries[allSummaries.length - 1].date}` : '-'],
    ['总收益', `¥${totalIncome.toFixed(2)}`],
    ['总阅读量', totalRead],
    ['平均RPM', totalRead > 0 ? `¥${((totalIncome / totalRead) * 1000).toFixed(2)}` : '-'],
    ['内容总数', `${contentCount}篇`],
    ['文章数', `${articleCount}篇`],
    ['回答数', `${answerCount}篇`],
    ['日均收益', days > 0 ? `¥${(totalIncome / days).toFixed(2)}` : '-'],
    ['采集天数', `${days}天`],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 15 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, '摘要');

  // Sheet 2: Daily Summary
  const dailyHeader = ['日期', '收益(元)', '阅读量', '互动量', '内容篇数', 'RPM'];
  const dailyRows = allSummaries.map(s => [
    s.date,
    +(s.totalIncome / 100).toFixed(2),
    s.totalRead,
    s.totalInteraction,
    s.contentCount,
    s.totalRead > 0 ? +((s.totalIncome / 100 / s.totalRead) * 1000).toFixed(2) : 0,
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyRows]);
  ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, '每日汇总');

  // Sheet 3: Content Details
  const contentHeader = ['标题', '类型', '发布日期', '总收益(元)', '总阅读', '总互动', 'RPM'];
  const contentAgg = new Map<string, {
    title: string; type: string; publishDate: string;
    income: number; read: number; interaction: number;
  }>();
  for (const r of allRecords) {
    const existing = contentAgg.get(r.contentId);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.interaction += r.currentInteraction;
    } else {
      contentAgg.set(r.contentId, {
        title: r.title,
        type: r.contentType === 'article' ? '文章' : '回答',
        publishDate: r.publishDate,
        income: r.currentIncome,
        read: r.currentRead,
        interaction: r.currentInteraction,
      });
    }
  }
  const contentRows = Array.from(contentAgg.values())
    .sort((a, b) => b.income - a.income)
    .map(c => [
      c.title, c.type, c.publishDate,
      +(c.income / 100).toFixed(2), c.read, c.interaction,
      c.read > 0 ? +((c.income / 100 / c.read) * 1000).toFixed(2) : 0,
    ]);
  const ws3 = XLSX.utils.aoa_to_sheet([contentHeader, ...contentRows]);
  ws3['!cols'] = [{ wch: 40 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, '内容明细');

  // Sheet 4: Monthly Summary
  const monthAgg = new Map<string, { income: number; read: number; contentIds: Set<string> }>();
  for (const r of allRecords) {
    const month = r.recordDate.slice(0, 7);
    const existing = monthAgg.get(month);
    if (existing) {
      existing.income += r.currentIncome;
      existing.read += r.currentRead;
      existing.contentIds.add(r.contentId);
    } else {
      monthAgg.set(month, { income: r.currentIncome, read: r.currentRead, contentIds: new Set([r.contentId]) });
    }
  }
  const months = Array.from(monthAgg.keys()).sort();
  const monthlyHeader = ['月份', '收益(元)', '阅读量', '内容篇数', 'RPM', '环比增长(%)'];
  const monthlyRows = months.map((month, idx) => {
    const m = monthAgg.get(month)!;
    const income = m.income / 100;
    const rpm = m.read > 0 ? (income / m.read) * 1000 : 0;
    let growth: string | number = '-';
    if (idx > 0) {
      const prevIncome = monthAgg.get(months[idx - 1])!.income / 100;
      if (prevIncome > 0) {
        growth = +(((income - prevIncome) / prevIncome) * 100).toFixed(1);
      }
    }
    return [month, +income.toFixed(2), m.read, m.contentIds.size, +rpm.toFixed(2), growth];
  });
  const ws4 = XLSX.utils.aoa_to_sheet([monthlyHeader, ...monthlyRows]);
  ws4['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws4, '按月汇总');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `知析报告-${userName}-${today}.xlsx`);
}
