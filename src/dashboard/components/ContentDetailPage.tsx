import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { getContentDailyRecords } from '@/db/content-daily-store';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCollector } from '@/hooks/use-collector';

interface Props {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
  /** Income records for this content across all dates */
  incomeRecords: IncomeRecord[];
  onBack: () => void;
}

type Metric = 'pv' | 'show' | 'upvote' | 'comment' | 'collect' | 'share';

const ALL_METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'pv', label: '阅读量', color: '#1a73e8' },
  { key: 'show', label: '曝光量', color: '#999' },
  { key: 'upvote', label: '点赞', color: '#ea4335' },
  { key: 'comment', label: '评论', color: '#34a853' },
  { key: 'collect', label: '收藏', color: '#fbbc04' },
  { key: 'share', label: '分享', color: '#9c27b0' },
];

export function ContentDetailPage({ contentId, contentToken, contentType, title, publishDate, incomeRecords, onBack }: Props) {
  const { user } = useCurrentUser();
  const { status } = useCollector();
  const [dailyRecords, setDailyRecords] = useState<ContentDailyRecord[]>([]);
  const [fetchMsg, setFetchMsg] = useState('');

  const loadDailyData = () => {
    if (!user) return;
    getContentDailyRecords(user.id, contentToken).then(setDailyRecords);
  };

  useEffect(() => { loadDailyData(); }, [user, contentToken]);

  // Reload when collection finishes
  const prevCollecting = React.useRef(status.isCollecting);
  useEffect(() => {
    if (prevCollecting.current && !status.isCollecting) loadDailyData();
    prevCollecting.current = status.isCollecting;
  }, [status.isCollecting]);

  // Income summary
  const incomeSummary = useMemo(() => {
    let totalIncome = 0, totalRead = 0, totalInteraction = 0;
    for (const r of incomeRecords) {
      totalIncome += r.currentIncome;
      totalRead += r.currentRead;
      totalInteraction += r.currentInteraction;
    }
    return { totalIncome, totalRead, totalInteraction, days: incomeRecords.length };
  }, [incomeRecords]);

  // Daily summary from daily records
  const dailySummary = useMemo(() => {
    let totalPv = 0, totalUpvote = 0, totalComment = 0, totalCollect = 0, totalShare = 0, totalShow = 0;
    for (const r of dailyRecords) {
      totalPv += r.pv; totalUpvote += r.upvote; totalComment += r.comment;
      totalCollect += r.collect; totalShare += r.share; totalShow += r.show;
    }
    return { totalPv, totalUpvote, totalComment, totalCollect, totalShare, totalShow };
  }, [dailyRecords]);

  const handleFetchDaily = async () => {
    setFetchMsg('');
    try {
      const response = await new Promise<{ ok: boolean; count?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'fetchContentDaily', items: [{ contentId, contentToken, contentType, title, publishDate }] },
          (resp) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve(resp);
          }
        );
      });
      if (response.ok) {
        setFetchMsg(`拉取完成，共 ${response.count} 条数据`);
        loadDailyData();
      } else {
        setFetchMsg(`拉取失败: ${response.error}`);
      }
    } catch (err) {
      setFetchMsg(`拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // Income trend (from income records)
  const incomeTrendOption = useMemo(() => {
    if (incomeRecords.length === 0) return null;
    const sorted = [...incomeRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    return {
      tooltip: { trigger: 'axis' as const, formatter: (params: any[]) => `${params[0].name}<br/>¥${(params[0].value / 100).toFixed(2)}` },
      grid: { left: 50, right: 30, top: 20, bottom: 30 },
      xAxis: { type: 'category' as const, data: sorted.map(r => r.recordDate.slice(5)), axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => `¥${(v / 100).toFixed(0)}` } },
      series: [{
        type: 'bar',
        data: sorted.map(r => r.currentIncome),
        itemStyle: { color: '#1a73e8', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      }],
    };
  }, [incomeRecords]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          padding: '6px 14px', border: '1px solid #ddd', borderRadius: 4,
          background: '#fff', cursor: 'pointer', fontSize: 13,
        }}>
          ← 返回
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            <span style={{
              padding: '1px 6px', borderRadius: 3, fontSize: 11, marginRight: 8,
              background: contentType === 'article' ? '#e8f0fe' : '#fef7e0',
              color: contentType === 'article' ? '#1a73e8' : '#f9a825',
            }}>
              {contentType === 'article' ? '文章' : '回答'}
            </span>
            发布于 {publishDate}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
        <SummaryCard label="总收益" value={`¥${(incomeSummary.totalIncome / 100).toFixed(2)}`} highlight />
        <SummaryCard label="总阅读" value={incomeSummary.totalRead.toLocaleString()} />
        <SummaryCard label="总互动" value={incomeSummary.totalInteraction.toLocaleString()} />
        {dailyRecords.length > 0 && (
          <>
            <SummaryCard label="总曝光" value={dailySummary.totalShow.toLocaleString()} />
            <SummaryCard label="总点赞" value={dailySummary.totalUpvote.toLocaleString()} />
            <SummaryCard label="总评论" value={dailySummary.totalComment.toLocaleString()} />
            <SummaryCard label="总收藏" value={dailySummary.totalCollect.toLocaleString()} />
            <SummaryCard label="总分享" value={dailySummary.totalShare.toLocaleString()} />
          </>
        )}
      </div>

      {/* Income trend */}
      {incomeTrendOption && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>每日收益</h3>
          <ReactECharts option={incomeTrendOption} style={{ height: 250 }} />
        </div>
      )}

      {/* Daily detail section */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>每日数据详情</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {status.isCollecting && (
              <span style={{ fontSize: 12, color: '#1a73e8' }}>
                {status.currentDate} ({status.progress}/{status.total})
              </span>
            )}
            <button onClick={handleFetchDaily} disabled={status.isCollecting} style={{
              padding: '4px 12px', background: '#1a73e8', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontSize: 12,
              opacity: status.isCollecting ? 0.6 : 1,
            }}>
              {status.isCollecting ? '拉取中...' : dailyRecords.length > 0 ? '更新数据' : '拉取数据'}
            </button>
          </div>
        </div>

        {fetchMsg && (
          <div style={{ marginBottom: 8, fontSize: 12, color: fetchMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
            {fetchMsg}
          </div>
        )}

        {dailyRecords.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {ALL_METRICS.map(({ key, label, color }) => (
              <MetricChart key={key} label={label} color={color} data={dailyRecords.map(r => r[key])} dates={dailyRecords.map(r => r.date.slice(5))} />
            ))}
          </div>
        ) : (
          <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13, background: '#f9f9f9', borderRadius: 8 }}>
            暂无每日详细数据，点击上方"拉取数据"按钮获取
          </div>
        )}
      </div>
    </div>
  );
}

function MetricChart({ label, color, data, dates }: { label: string; color: string; data: number[]; dates: string[] }) {
  const option = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 45, right: 15, top: 25, bottom: 25 },
    title: { text: label, textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3 },
    series: [{
      type: 'line',
      data,
      smooth: true,
      itemStyle: { color },
      lineStyle: { width: 2 },
      areaStyle: { color: `${color}18` },
    }],
  };
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? '#1a73e8' : '#f5f5f5',
      color: highlight ? '#fff' : '#333',
      borderRadius: 8, padding: '10px 12px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
