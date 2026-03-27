import React, { useEffect, useState } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCollector } from '@/hooks/use-collector';
import { TodaySummary } from './components/TodaySummary';
import { WeekSparkline } from './components/WeekSparkline';
import { STORAGE_KEYS } from '@/shared/constants';

export function Popup() {
  const today = formatDate(new Date());
  const { start: weekStart } = getDateRange(7);
  const startStr = formatDate(weekStart);

  const { summaries, loading, refresh } = useIncomeData(startStr, today);
  const { status, collect } = useCollector();

  const todaySummary = summaries.find((s) => s.date === today);

  // Manual collection date range
  const { start: defaultCollectStart } = getDateRange(7);
  const [collectStart, setCollectStart] = useState(formatDate(defaultCollectStart));
  const [collectEnd, setCollectEnd] = useState(today);
  const [resultMsg, setResultMsg] = useState('');

  // Auto-collect today on first open
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

  const handleCollect = async () => {
    setResultMsg('');
    try {
      const count = await collect(collectStart, collectEnd);
      setResultMsg(`采集完成，共 ${count} 条记录`);
      refresh();
    } catch (err) {
      setResultMsg(`采集失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const openDashboard = () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
    window.close();
  };

  return (
    <div style={{ width: 340, padding: 12, fontFamily: '-apple-system, sans-serif' }}>
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

      {/* Manual collection panel */}
      <div style={{ marginTop: 10, padding: 10, background: '#f5f5f5', borderRadius: 6 }}>
        <div style={{ fontSize: 12, color: '#333', fontWeight: 600, marginBottom: 6 }}>数据采集</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <input type="date" value={collectStart} onChange={(e) => setCollectStart(e.target.value)}
            style={{ padding: '3px 6px', border: '1px solid #ddd', borderRadius: 3, fontSize: 11, width: 110 }} />
          <span style={{ color: '#999', fontSize: 11 }}>至</span>
          <input type="date" value={collectEnd} onChange={(e) => setCollectEnd(e.target.value)}
            style={{ padding: '3px 6px', border: '1px solid #ddd', borderRadius: 3, fontSize: 11, width: 110 }} />
          <button onClick={handleCollect} disabled={status.isCollecting} style={{
            padding: '3px 10px', background: '#1a73e8', color: '#fff', border: 'none',
            borderRadius: 3, cursor: 'pointer', fontSize: 11, opacity: status.isCollecting ? 0.6 : 1,
          }}>
            {status.isCollecting ? '采集中...' : '采集'}
          </button>
        </div>

        {status.isCollecting && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#1a73e8' }}>
            正在采集 {status.currentDate}... ({status.progress}/{status.total})
            <div style={{ marginTop: 3, height: 3, background: '#e0e0e0', borderRadius: 2 }}>
              <div style={{
                height: '100%', background: '#1a73e8', borderRadius: 2,
                width: `${status.total > 0 ? (status.progress / status.total) * 100 : 0}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {resultMsg && (
          <div style={{ marginTop: 4, fontSize: 11, color: resultMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
            {resultMsg}
          </div>
        )}
      </div>

      {status.error && !resultMsg && (
        <div style={{ fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 8 }}>
          {status.error}
        </div>
      )}
    </div>
  );
}
