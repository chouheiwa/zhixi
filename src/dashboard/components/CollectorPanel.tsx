import React, { useState } from 'react';
import { useCollector } from '@/hooks/use-collector';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useUserSettings } from '@/hooks/use-user-settings';

interface Props {
  onCollected: () => void;
}

export function CollectorPanel({ onCollected }: Props) {
  const { user } = useCurrentUser();
  const { settings, refresh: refreshSettings } = useUserSettings(user?.id ?? '');
  const { status, sync } = useCollector();
  const [startDate, setStartDate] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const hasSetup = !!settings?.collectStartDate;

  const handleSync = async () => {
    setResultMsg('');
    try {
      const result = await sync(hasSetup ? undefined : startDate || undefined);
      if (!hasSetup) refreshSettings();
      if (result.synced === 0) {
        setResultMsg('数据已是最新');
      } else {
        setResultMsg(`同步完成，补全 ${result.synced} 天，共 ${result.count} 条记录`);
      }
      onCollected();
    } catch (err) {
      setResultMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>数据采集</h3>

      {hasSetup ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#666' }}>
            数据范围：{settings!.collectStartDate} 起
          </div>
          <button onClick={handleSync} disabled={status.isCollecting} style={btnStyle(status.isCollecting)}>
            {status.isCollecting ? '同步中...' : '同步数据'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
            请设置致知计划开通日期，插件将从该日期开始采集
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }} />
            <button onClick={handleSync} disabled={status.isCollecting || !startDate}
              style={btnStyle(status.isCollecting || !startDate)}>
              {status.isCollecting ? '同步中...' : '开始同步'}
            </button>
          </div>
        </div>
      )}

      {status.isCollecting && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#1a73e8' }}>
          {status.currentDate} ({status.progress}/{status.total})
          <div style={{ marginTop: 4, height: 4, background: '#e0e0e0', borderRadius: 2 }}>
            <div style={{
              height: '100%', background: '#1a73e8', borderRadius: 2,
              width: `${status.total > 0 ? (status.progress / status.total) * 100 : 0}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {resultMsg && (
        <div style={{ marginTop: 8, fontSize: 12, color: resultMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
          {resultMsg}
        </div>
      )}
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 16px', background: '#1a73e8', color: '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
    opacity: disabled ? 0.6 : 1,
  };
}
