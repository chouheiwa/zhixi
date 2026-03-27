import React, { useState } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { DateRangePicker } from './components/DateRangePicker';
import { DailyTrendChart } from './components/DailyTrendChart';
import { ContentTable } from './components/ContentTable';
import { TypeComparisonChart } from './components/TypeComparisonChart';

export function Dashboard() {
  const { start: defaultStart, end: defaultEnd } = getDateRange(30);
  const [startDate, setStartDate] = useState(formatDate(defaultStart));
  const [endDate, setEndDate] = useState(formatDate(defaultEnd));

  const { records, summaries, loading, refresh } = useIncomeData(startDate, endDate);

  const handleQuickSelect = (days: number) => {
    const { start, end } = getDateRange(days);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>知乎致知收益分析</h1>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          onQuickSelect={handleQuickSelect}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
      ) : summaries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          暂无数据，请先采集收益数据
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <DailyTrendChart summaries={summaries} startDate={startDate} endDate={endDate} />
          <TypeComparisonChart records={records} />
          <ContentTable records={records} />
        </div>
      )}
    </div>
  );
}
