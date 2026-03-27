import React, { useState } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCurrentUser } from '@/hooks/use-current-user';
import { DateRangePicker } from './components/DateRangePicker';
import { DailyTrendChart } from './components/DailyTrendChart';
import { ContentTable, type ContentTableItem } from './components/ContentTable';
import { TypeComparisonChart } from './components/TypeComparisonChart';
import { ConversionAnalysis } from './components/ConversionAnalysis';
import { TopContentRanking } from './components/TopContentRanking';
import { CollectorPanel } from './components/CollectorPanel';
import { ExportImportPanel } from './components/ExportImportPanel';
import { ContentDetailPage } from './components/ContentDetailPage';
import { GlobalCorrelationAnalysis } from './components/CorrelationAnalysis';

export function Dashboard() {
  const { start: defaultStart, end: defaultEnd } = getDateRange(30);
  const [startDate, setStartDate] = useState(formatDate(defaultStart));
  const [endDate, setEndDate] = useState(formatDate(defaultEnd));
  const [selectedContent, setSelectedContent] = useState<ContentTableItem | null>(null);

  const { user, loading: userLoading } = useCurrentUser();
  const { records, summaries, loading, refresh } = useIncomeData(user?.id ?? '', startDate, endDate);

  const handleQuickSelect = (days: number) => {
    const { start, end } = getDateRange(days);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  if (userLoading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 40, textAlign: 'center', color: '#999' }}>
        正在连接知乎...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: '-apple-system, sans-serif' }}>
      {selectedContent ? (
        // Detail page
        <ContentDetailPage
          contentId={selectedContent.contentId}
          contentToken={selectedContent.contentToken}
          contentType={selectedContent.contentType}
          title={selectedContent.title}
          publishDate={selectedContent.publishDate}
          onBack={() => setSelectedContent(null)}
        />
      ) : (
        // Overview page
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 20, margin: 0 }}>知乎致知收益分析</h1>
              {user && <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>{user.name}</div>}
            </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <ConversionAnalysis records={records} />
                <TopContentRanking records={records} />
              </div>
              <GlobalCorrelationAnalysis records={records} />
              <ContentTable records={records} onContentClick={setSelectedContent} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
            <CollectorPanel onCollected={refresh} />
            <ExportImportPanel onImported={refresh} />
          </div>
        </>
      )}
    </div>
  );
}
