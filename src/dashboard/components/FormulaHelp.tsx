import React, { useState } from 'react';
import { themeColors } from '../theme';

interface Props {
  formula: string;
  explanation: string;
}

export function FormulaHelp({ formula, explanation }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          fontSize: 10,
          fontWeight: 700,
          background: open ? themeColors.warmBlue : themeColors.border,
          color: open ? '#fff' : '#999',
          cursor: 'pointer',
          userSelect: 'none',
          marginLeft: 4,
          flexShrink: 0,
        }}
      >
        ?
      </span>
      {open && (
        <div
          style={{
            position: 'absolute',
            left: 24,
            top: -4,
            zIndex: 100,
            background: '#fff',
            border: `1px solid ${themeColors.border}`,
            borderRadius: 8,
            padding: '10px 14px',
            width: 320,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#333' }}>计算公式</div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              background: themeColors.paper,
              padding: '6px 10px',
              borderRadius: 4,
              marginBottom: 8,
              whiteSpace: 'pre-wrap',
              color: themeColors.warmBlue,
            }}
          >
            {formula}
          </div>
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6 }}>{explanation}</div>
        </div>
      )}
    </span>
  );
}

export function FormulaBlock({
  title,
  items,
}: {
  title: string;
  items: { name: string; formula: string; desc: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ fontSize: 11, color: themeColors.warmBlue, cursor: 'pointer', userSelect: 'none' }}
      >
        {open ? '▾' : '▸'} 查看计算说明
      </div>
      {open && (
        <div
          style={{
            marginTop: 6,
            background: '#f8f9fa',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            lineHeight: 1.8,
          }}
        >
          {title && <div style={{ fontWeight: 600, marginBottom: 6, color: '#333' }}>{title}</div>}
          {items.map((item, i) => (
            <div key={i} style={{ marginBottom: i < items.length - 1 ? 8 : 0 }}>
              <div style={{ color: '#333', fontWeight: 500 }}>{item.name}</div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: themeColors.warmBlue,
                  background: '#fff',
                  padding: '3px 8px',
                  borderRadius: 3,
                  margin: '2px 0',
                  display: 'inline-block',
                }}
              >
                {item.formula}
              </div>
              <div style={{ color: '#888' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
