import React, { useState, useCallback, useMemo } from 'react';
import { Button, Modal, Tabs, Select, Spin, message } from 'antd';
import { ShareAltOutlined, DownloadOutlined } from '@ant-design/icons';
import type { DailySummary, IncomeRecord } from '@/shared/types';
import { formatIncome, getCurrencyUnit } from '@/shared/currency';
import {
  renderMonthlyReportCard,
  renderMilestoneCard,
  renderHotContentCard,
  renderAnnualSummaryCard,
} from '@/shared/card-renderer';
import type { MonthlyReportData, MilestoneData, HotContentData, AnnualSummaryData } from '@/shared/types';

interface Props {
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

type CardType = 'monthly' | 'milestone' | 'hotContent' | 'annual';

function buildMonthlyData(month: string, allSummaries: DailySummary[]): MonthlyReportData | null {
  const monthSummaries = allSummaries.filter((s) => s.date.startsWith(month));
  if (monthSummaries.length === 0) return null;

  const totalIncome = monthSummaries.reduce((s, d) => s + d.totalIncome, 0);
  const dailyAvgIncome = Math.round(totalIncome / monthSummaries.length);

  let bestDay: DailySummary | null = null;
  for (const s of monthSummaries) {
    if (!bestDay || s.totalIncome > bestDay.totalIncome) bestDay = s;
  }

  // Previous month
  const [year, mon] = month.split('-').map(Number);
  const prevDate = new Date(year, mon - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthTotal = allSummaries
    .filter((s) => s.date.startsWith(prevMonth))
    .reduce((s, d) => s + d.totalIncome, 0);

  const growthRate = prevMonthTotal > 0 ? (totalIncome - prevMonthTotal) / prevMonthTotal : 0;

  const cumulativeIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0);

  return {
    month,
    totalIncome,
    dailyAvgIncome,
    bestDayIncome: bestDay?.totalIncome ?? 0,
    bestDayDate: bestDay?.date ?? '',
    growthRate,
    cumulativeIncome,
  };
}

function buildMilestoneData(allSummaries: DailySummary[], allRecords: IncomeRecord[]): MilestoneData {
  const cumulativeIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0);
  const totalIncomeFen = cumulativeIncome;

  const milestoneThresholds = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
  let achievedCount = 0;
  for (const t of milestoneThresholds) {
    if (totalIncomeFen >= t) achievedCount++;
  }

  const contentIds = new Set(allRecords.map((r) => r.contentId));
  const contentThresholds = [10, 50, 100];
  for (const t of contentThresholds) {
    if (contentIds.size >= t) achievedCount++;
  }

  const sorted = [...allSummaries].sort((a, b) => a.date.localeCompare(b.date));
  let maxStreak = 0;
  let streak = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].totalIncome > 0) {
      streak++;
      if (i > 0) {
        const prev = new Date(sorted[i - 1].date);
        const curr = new Date(sorted[i].date);
        const diff = (curr.getTime() - prev.getTime()) / 86400000;
        if (diff !== 1) streak = 1;
      }
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  for (const t of [7, 30, 90]) {
    if (maxStreak >= t) achievedCount++;
  }

  const latestAchievedDate = sorted[sorted.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  return {
    name: `累计收益达到 ${formatIncome(cumulativeIncome, getCurrencyUnit())}`,
    achievedDate: latestAchievedDate,
    totalMilestones: achievedCount,
    cumulativeIncome,
  };
}

function buildHotContentData(allRecords: IncomeRecord[]): HotContentData | null {
  if (allRecords.length === 0) return null;

  const contentMap = new Map<string, { title: string; income: number; pv: number }>();
  for (const r of allRecords) {
    const existing = contentMap.get(r.contentId);
    if (!existing) {
      contentMap.set(r.contentId, {
        title: r.title,
        income: r.totalIncome,
        pv: r.totalRead,
      });
    } else {
      contentMap.set(r.contentId, {
        title: r.title,
        income: Math.max(existing.income, r.totalIncome),
        pv: Math.max(existing.pv, r.totalRead),
      });
    }
  }

  let hotContent: { title: string; income: number; pv: number } | null = null;
  for (const c of contentMap.values()) {
    if (!hotContent || c.income > hotContent.income) hotContent = c;
  }
  if (!hotContent) return null;

  const rpm = hotContent.pv > 0 ? (hotContent.income / 100 / hotContent.pv) * 1000 : 0;

  const allIncomes = Array.from(contentMap.values()).map((c) => c.income);
  allIncomes.sort((a, b) => a - b);
  const rank = allIncomes.findIndex((v) => v >= hotContent!.income);
  const percentile = Math.round((rank / allIncomes.length) * 100);

  return {
    title: hotContent.title,
    income: hotContent.income,
    pv: hotContent.pv,
    rpm,
    percentile,
  };
}

function buildAnnualData(
  year: number,
  allSummaries: DailySummary[],
  allRecords: IncomeRecord[],
): AnnualSummaryData | null {
  const yearStr = String(year);
  const yearSummaries = allSummaries.filter((s) => s.date.startsWith(yearStr));
  if (yearSummaries.length === 0) return null;

  const totalIncome = yearSummaries.reduce((s, d) => s + d.totalIncome, 0);

  const monthlyIncomes: number[] = Array(12).fill(0);
  for (const s of yearSummaries) {
    const m = parseInt(s.date.split('-')[1]) - 1;
    monthlyIncomes[m] += s.totalIncome;
  }

  let bestMonthIdx = 0;
  for (let i = 1; i < 12; i++) {
    if (monthlyIncomes[i] > monthlyIncomes[bestMonthIdx]) bestMonthIdx = i;
  }

  const yearRecords = allRecords.filter((r) => r.recordDate.startsWith(yearStr));
  const contentIds = new Set(yearRecords.map((r) => r.contentId));

  const cumulativeIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0);

  return {
    year,
    totalIncome,
    contentCount: contentIds.size,
    bestMonth: `${bestMonthIdx + 1}月`,
    bestMonthIncome: monthlyIncomes[bestMonthIdx],
    monthlyIncomes,
    cumulativeIncome,
  };
}

export function ShareCardButton({ allSummaries, allRecords }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CardType>('monthly');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Compute available months from summaries
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const s of allSummaries) {
      months.add(s.date.slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }, [allSummaries]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const s of allSummaries) {
      years.add(parseInt(s.date.slice(0, 4)));
    }
    return Array.from(years).sort().reverse();
  }, [allSummaries]);

  // Set defaults when data changes
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
    if (availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableMonths, availableYears, selectedMonth]);

  const generateCard = useCallback(async () => {
    setGenerating(true);
    setPreviewUrl(null);
    try {
      let blob: Blob | null = null;

      if (activeTab === 'monthly') {
        const monthData = buildMonthlyData(selectedMonth, allSummaries);
        if (!monthData) {
          void message.warning('所选月份暂无数据');
          return;
        }
        blob = await renderMonthlyReportCard(monthData);
      } else if (activeTab === 'milestone') {
        const mData = buildMilestoneData(allSummaries, allRecords);
        blob = await renderMilestoneCard(mData);
      } else if (activeTab === 'hotContent') {
        const hData = buildHotContentData(allRecords);
        if (!hData) {
          void message.warning('暂无内容数据');
          return;
        }
        blob = await renderHotContentCard(hData);
      } else if (activeTab === 'annual') {
        const aData = buildAnnualData(selectedYear, allSummaries, allRecords);
        if (!aData) {
          void message.warning('所选年份暂无数据');
          return;
        }
        blob = await renderAnnualSummaryCard(aData);
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (err) {
      void message.error('生成卡片失败，请重试');
    } finally {
      setGenerating(false);
    }
  }, [activeTab, selectedMonth, selectedYear, allSummaries, allRecords]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `知析-${activeTab}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [previewUrl, activeTab]);

  const handleClose = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setOpen(false);
  }, [previewUrl]);

  const cardTypeOptions = [
    {
      key: 'monthly' as const,
      label: '月度战报',
      extra:
        availableMonths.length > 0 ? (
          <Select
            size="small"
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={availableMonths.map((m) => ({ label: m, value: m }))}
            style={{ width: 130 }}
          />
        ) : null,
    },
    { key: 'milestone' as const, label: '里程碑达成', extra: null },
    { key: 'hotContent' as const, label: '爆款内容', extra: null },
    {
      key: 'annual' as const,
      label: '年度总结',
      extra:
        availableYears.length > 0 ? (
          <Select
            size="small"
            value={selectedYear}
            onChange={setSelectedYear}
            options={availableYears.map((y) => ({ label: `${y}年`, value: y }))}
            style={{ width: 100 }}
          />
        ) : null,
    },
  ];

  const activeOption = cardTypeOptions.find((o) => o.key === activeTab);

  return (
    <>
      <Button icon={<ShareAltOutlined />} size="small" onClick={() => setOpen(true)}>
        生成卡片
      </Button>
      <Modal title="生成分享卡片" open={open} onCancel={handleClose} footer={null} width={520} destroyOnClose>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as CardType);
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
            }
          }}
          items={cardTypeOptions.map((opt) => ({
            key: opt.key,
            label: opt.label,
          }))}
        />

        {activeOption?.extra && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ marginRight: 8, fontSize: 13, color: '#666' }}>选择：</span>
            {activeOption.extra}
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Button type="primary" onClick={generateCard} loading={generating}>
            生成预览
          </Button>
        </div>

        {generating && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="生成中..." />
          </div>
        )}

        {previewUrl && !generating && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={previewUrl}
              alt="卡片预览"
              style={{
                width: '100%',
                maxWidth: 400,
                borderRadius: 8,
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                marginBottom: 16,
              }}
            />
            <div>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} size="large">
                保存图片
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
