import React from 'react';

interface Props {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onQuickSelect: (days: number) => void;
}

const QUICK_RANGES = [
  { label: '7天', days: 7 },
  { label: '14天', days: 14 },
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
];

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, onQuickSelect }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} style={inputStyle} />
      <span style={{ color: '#999' }}>至</span>
      <input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
        {QUICK_RANGES.map((r) => (
          <button key={r.days} onClick={() => onQuickSelect(r.days)} style={quickBtnStyle}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13,
};

const quickBtnStyle: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid #ddd', borderRadius: 4,
  background: '#fff', cursor: 'pointer', fontSize: 12,
};
