import React, { useCallback } from 'react';
import { Button } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { DailySummary, IncomeRecord } from '@/shared/types';
import { generateHtmlReport, type HtmlReportData } from '@/shared/html-report-generator';

interface ExportHtmlButtonProps {
  userName: string;
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

function buildReportData(userName: string, allSummaries: DailySummary[], allRecords: IncomeRecord[]): HtmlReportData {
  const totalIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0);
  const activeDays = allSummaries.length;
  const dailyAvgIncome = activeDays > 0 ? Math.round(totalIncome / activeDays) : 0;

  // Daily trend sorted by date
  const dailyTrend = [...allSummaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, income: s.totalIncome }));

  // Aggregate per content
  const contentMap = new Map<
    string,
    {
      title: string;
      contentType: string;
      publishDate: string;
      totalIncome: number;
      totalPv: number;
    }
  >();
  for (const r of allRecords) {
    const existing = contentMap.get(r.contentId);
    if (existing) {
      existing.totalIncome += r.currentIncome;
      existing.totalPv += r.currentRead;
    } else {
      contentMap.set(r.contentId, {
        title: r.title,
        contentType: r.contentType,
        publishDate: r.publishDate,
        totalIncome: r.currentIncome,
        totalPv: r.currentRead,
      });
    }
  }

  const contentList = Array.from(contentMap.values()).sort((a, b) => b.totalIncome - a.totalIncome);
  const contentCount = contentList.length;

  // Top 10 by income
  const topContent = contentList.slice(0, 10).map((c) => ({
    title: c.title,
    contentType: c.contentType,
    income: c.totalIncome,
    pv: c.totalPv,
    rpm: c.totalPv > 0 ? Math.round((c.totalIncome / c.totalPv) * 1000) : 0,
  }));

  // RPM by content type
  const typeMap = new Map<string, { totalIncome: number; totalPv: number; count: number }>();
  for (const c of contentList) {
    const existing = typeMap.get(c.contentType);
    if (existing) {
      existing.totalIncome += c.totalIncome;
      existing.totalPv += c.totalPv;
      existing.count += 1;
    } else {
      typeMap.set(c.contentType, { totalIncome: c.totalIncome, totalPv: c.totalPv, count: 1 });
    }
  }
  const rpmByType = Array.from(typeMap.entries())
    .map(([type, v]) => ({
      type,
      rpm: v.totalPv > 0 ? Math.round((v.totalIncome / v.totalPv) * 1000) : 0,
      count: v.count,
    }))
    .sort((a, b) => b.rpm - a.rpm);

  // All content for the full table
  const allContent = contentList.map((c) => ({
    title: c.title,
    contentType: c.contentType,
    totalIncome: c.totalIncome,
    totalPv: c.totalPv,
    publishDate: c.publishDate,
  }));

  return {
    userName,
    generatedAt: new Date().toISOString(),
    totalIncome,
    contentCount,
    dailyAvgIncome,
    activeDays,
    dailyTrend,
    topContent,
    rpmByType,
    allContent,
  };
}

export function ExportHtmlButton({ userName, allSummaries, allRecords }: ExportHtmlButtonProps) {
  const handleExport = useCallback(() => {
    const data = buildReportData(userName, allSummaries, allRecords);
    const html = generateHtmlReport(data);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `知析报告-${today}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [userName, allSummaries, allRecords]);

  return (
    <Button icon={<FileTextOutlined />} onClick={handleExport} size="small">
      导出 HTML 报告
    </Button>
  );
}
