import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord } from '@/shared/types';
import { getContentDailyRecords } from '@/db/content-daily-store';
import { useCurrentUser } from '@/hooks/use-current-user';

interface ContentItem {
  contentId: string;
  contentToken: string;
  title: string;
}

interface Props {
  /** List of content items that have daily data */
  items: ContentItem[];
}

type Metric = 'pv' | 'show' | 'upvote' | 'comment' | 'collect' | 'share';

const METRIC_LABELS: Record<Metric, string> = {
  pv: '阅读量',
  show: '曝光量',
  upvote: '点赞',
  comment: '评论',
  collect: '收藏',
  share: '分享',
};

const METRIC_COLORS: Record<Metric, string> = {
  pv: '#1a73e8',
  show: '#999',
  upvote: '#ea4335',
  comment: '#34a853',
  collect: '#fbbc04',
  share: '#9c27b0',
};

export function ContentDetailChart({ items }: Props) {
  const { user } = useCurrentUser();
  const [selectedToken, setSelectedToken] = useState(items[0]?.contentToken ?? '');
  const [records, setRecords] = useState<ContentDailyRecord[]>([]);
  const [metrics, setMetrics] = useState<Set<Metric>>(new Set(['pv', 'upvote', 'collect']));

  useEffect(() => {
    if (!user || !selectedToken) {
      setRecords([]);
      return;
    }
    getContentDailyRecords(user.id, selectedToken).then(setRecords);
  }, [user, selectedToken]);

  if (items.length === 0) return null;

  const toggleMetric = (m: Metric) => {
    setMetrics(prev => {
      const next = new Set(prev);
      if (next.has(m)) { if (next.size > 1) next.delete(m); }
      else next.add(m);
      return next;
    });
  };

  const dates = records.map(r => r.date.slice(5));

  const series = Array.from(metrics).map(m => ({
    name: METRIC_LABELS[m],
    type: 'line' as const,
    data: records.map(r => r[m]),
    smooth: true,
    itemStyle: { color: METRIC_COLORS[m] },
    lineStyle: { width: 2 },
    yAxisIndex: m === 'show' ? 1 : 0,
  }));

  const hasShow = metrics.has('show');

  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: series.map(s => s.name) },
    grid: { left: 50, right: hasShow ? 60 : 30, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: dates,
      axisLabel: { fontSize: 11 },
    },
    yAxis: hasShow ? [
      { type: 'value' as const, position: 'left' as const },
      { type: 'value' as const, position: 'right' as const, name: '曝光' },
    ] : [
      { type: 'value' as const },
    ],
    series,
  };

  const selectedItem = items.find(i => i.contentToken === selectedToken);

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>内容每日详情</h3>

      {/* Content selector */}
      <div style={{ marginBottom: 8 }}>
        <select
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, maxWidth: 500 }}
        >
          {items.map(item => (
            <option key={item.contentToken} value={item.contentToken}>
              {item.title}
            </option>
          ))}
        </select>
      </div>

      {/* Metric toggles */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(Object.entries(METRIC_LABELS) as [Metric, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggleMetric(key)}
            style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${METRIC_COLORS[key]}`,
              background: metrics.has(key) ? METRIC_COLORS[key] : '#fff',
              color: metrics.has(key) ? '#fff' : METRIC_COLORS[key],
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {records.length > 0 ? (
        <ReactECharts option={option} style={{ height: 350 }} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>
          {selectedItem ? '暂无每日数据，请先拉取' : '请选择一篇内容'}
        </div>
      )}
    </div>
  );
}
