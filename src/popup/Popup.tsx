import React, { useEffect } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCollector } from '@/hooks/use-collector';
import { TodaySummary } from './components/TodaySummary';
import { WeekSparkline } from './components/WeekSparkline';
import { STORAGE_KEYS } from '@/shared/constants';

export function Popup() {
  const today = formatDate(new Date());
  const { start } = getDateRange(7);
  const startStr = formatDate(start);

  const { summaries, loading, refresh } = useIncomeData(startStr, today);
  const { status, collect } = useCollector();

  const todaySummary = summaries.find((s) => s.date === today);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE).then(async (result) => {
      if (result[STORAGE_KEYS.LAST_COLLECT_DATE] !== today) {
        try {
          await collect(today, today);
          await chrome.storage.local.set({ [STORAGE_KEYS.LAST_COLLECT_DATE]: today });
          refresh();
        } catch { /* user can manually retry */ }
      }
    });
  }, [today, collect, refresh]);

  const openDashboard = () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
    window.close();
  };

  return (
    <div style={{ width: 320, padding: 12, fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 14, margin: 0 }}>知乎致知收益分析</h1>
        <button onClick={openDashboard} style={{
          fontSize: 12, padding: '4px 10px', border: '1px solid #ddd',
          borderRadius: 4, background: '#fff', cursor: 'pointer',
        }}>
          详细分析 →
        </button>
      </div>

      <TodaySummary summary={todaySummary} loading={loading} />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>近 7 天收益趋势</div>
        <WeekSparkline summaries={summaries} />
      </div>

      {status.isCollecting && (
        <div style={{ fontSize: 11, color: '#1a73e8', textAlign: 'center', marginTop: 8 }}>
          正在采集 {status.currentDate}... ({status.progress}/{status.total})
        </div>
      )}

      {status.error && (
        <div style={{ fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 8 }}>
          {status.error}
        </div>
      )}
    </div>
  );
}
