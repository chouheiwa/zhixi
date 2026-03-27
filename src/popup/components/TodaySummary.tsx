import React from 'react';
import type { DailySummary } from '@/shared/types';

interface Props {
  summary: DailySummary | undefined;
  loading: boolean;
}

export function TodaySummary({ summary, loading }: Props) {
  if (loading) return <div style={{ textAlign: 'center', padding: 16 }}>加载中...</div>;

  const income = summary?.totalIncome ?? 0;
  const read = summary?.totalRead ?? 0;
  const interaction = summary?.totalInteraction ?? 0;
  const count = summary?.contentCount ?? 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0' }}>
      <StatCard label="今日收益" value={`¥${(income / 100).toFixed(2)}`} highlight />
      <StatCard label="阅读量" value={String(read)} />
      <StatCard label="互动量" value={String(interaction)} />
      <StatCard label="内容数" value={String(count)} />
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? '#1a73e8' : '#f5f5f5',
        color: highlight ? '#fff' : '#333',
        borderRadius: 8,
        padding: '12px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
