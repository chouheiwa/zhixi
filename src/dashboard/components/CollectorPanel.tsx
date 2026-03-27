import React, { useState } from 'react';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useCollector } from '@/hooks/use-collector';

interface Props {
  onCollected: () => void;
}

export function CollectorPanel({ onCollected }: Props) {
  const { start: defaultStart } = getDateRange(7);
  const [startDate, setStartDate] = useState(formatDate(defaultStart));
  const [endDate, setEndDate] = useState(formatDate(new Date()));
  const [resultMsg, setResultMsg] = useState('');
  const { status, collect } = useCollector();

  const handleCollect = async () => {
    setResultMsg('');
    try {
      const count = await collect(startDate, endDate);
      setResultMsg(`采集完成，共 ${count} 条记录`);
      onCollected();
    } catch (err) {
      setResultMsg(`采集失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>数据采集</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        <span style={{ color: '#999' }}>至</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        <button onClick={handleCollect} disabled={status.isCollecting} style={{
          padding: '6px 16px', background: '#1a73e8', color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
          opacity: status.isCollecting ? 0.6 : 1,
        }}>
          {status.isCollecting ? '采集中...' : '开始采集'}
        </button>
      </div>
      {status.isCollecting && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#1a73e8' }}>
          正在采集 {status.currentDate}... ({status.progress}/{status.total})
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

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13,
};
