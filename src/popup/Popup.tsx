import React, { useState, useEffect } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCollector } from '@/hooks/use-collector';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useUserSettings } from '@/hooks/use-user-settings';
import { TodaySummary } from './components/TodaySummary';
import { WeekSparkline } from './components/WeekSparkline';

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

export function Popup() {
  const yesterday = getYesterday();
  const { start: weekStart } = getDateRange(7);
  const startStr = formatDate(weekStart);

  const { user, loading: userLoading } = useCurrentUser();
  const { settings, loading: settingsLoading, refresh: refreshSettings } = useUserSettings(user?.id ?? '');
  const { summaries, loading, refresh } = useIncomeData(user?.id ?? '', startStr, yesterday);
  const { status, sync } = useCollector();

  const yesterdaySummary = summaries.find((s) => s.date === yesterday);

  // First-time setup: start date input
  const [startDate, setStartDate] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  // Refresh data when collection finishes
  const prevCollecting = React.useRef(status.isCollecting);
  useEffect(() => {
    if (prevCollecting.current && !status.isCollecting && !status.error) {
      refresh();
    }
    prevCollecting.current = status.isCollecting;
  }, [status.isCollecting, status.error, refresh]);

  const handleSync = async () => {
    setResultMsg('');
    try {
      const result = await sync();
      if (result.synced === 0) {
        setResultMsg('数据已是最新');
      } else {
        setResultMsg(`同步完成，补全 ${result.synced} 天，共 ${result.count} 条记录`);
      }
      refresh();
    } catch (err) {
      setResultMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleSetupAndSync = async () => {
    if (!startDate) return;
    setResultMsg('');
    try {
      const result = await sync(startDate);
      setResultMsg(`首次同步完成，采集 ${result.synced} 天，共 ${result.count} 条记录`);
      refreshSettings();
      refresh();
    } catch (err) {
      setResultMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const openDashboard = () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
    window.close();
  };

  if (userLoading || settingsLoading) {
    return (
      <div style={{ width: 340, padding: 24, textAlign: 'center', fontFamily: '-apple-system, sans-serif', color: '#999' }}>
        正在连接知乎...
      </div>
    );
  }

  const hasSetup = !!settings?.collectStartDate;

  return (
    <div style={{ width: 340, padding: 12, fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 14, margin: 0 }}>知乎致知收益分析</h1>
          {user && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{user.name}</div>}
        </div>
        <button onClick={openDashboard} style={{
          fontSize: 12, padding: '4px 10px', border: '1px solid #ddd',
          borderRadius: 4, background: '#fff', cursor: 'pointer',
        }}>
          详细分析 →
        </button>
      </div>

      {hasSetup && (
        <>
          <TodaySummary summary={yesterdaySummary} loading={loading} />
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>近 7 天收益趋势</div>
            <WeekSparkline summaries={summaries} />
          </div>
        </>
      )}

      {/* Sync / Setup panel */}
      <div style={{ marginTop: 10, padding: 10, background: '#f5f5f5', borderRadius: 6 }}>
        {hasSetup ? (
          // Normal sync mode
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: '#333' }}>
              数据范围：{settings!.collectStartDate} 起
            </div>
            <button onClick={handleSync} disabled={status.isCollecting} style={{
              padding: '4px 14px', background: '#1a73e8', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontSize: 12, opacity: status.isCollecting ? 0.6 : 1,
            }}>
              {status.isCollecting ? '同步中...' : '同步数据'}
            </button>
          </div>
        ) : (
          // First-time setup
          <div>
            <div style={{ fontSize: 12, color: '#333', fontWeight: 600, marginBottom: 8 }}>
              首次使用：设置致知计划开通日期
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 3, fontSize: 12, flex: 1 }} />
              <button onClick={handleSetupAndSync} disabled={status.isCollecting || !startDate} style={{
                padding: '4px 14px', background: '#1a73e8', color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer', fontSize: 12,
                opacity: (status.isCollecting || !startDate) ? 0.6 : 1,
              }}>
                {status.isCollecting ? '同步中...' : '开始同步'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              选择你开通致知计划的大致日期，插件会从这天开始采集数据
            </div>
          </div>
        )}

        {status.isCollecting && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#1a73e8' }}>
            {status.currentDate} ({status.progress}/{status.total})
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
          <div style={{ marginTop: 6, fontSize: 11, color: resultMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
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
