import React, { useState, useRef } from 'react';
import { exportToJSON, importFromJSON } from '@/db/export-import';

interface Props {
  onImported: () => void;
}

export function ExportImportPanel({ onImported }: Props) {
  const [msg, setMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const json = await exportToJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zhihu-income-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('导出成功');
    } catch (err) {
      setMsg(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromJSON(text);
      setMsg(`导入成功，共 ${result.imported} 条记录`);
      onImported();
    } catch (err) {
      setMsg(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>数据备份</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleExport} style={btnStyle}>导出数据</button>
        <button onClick={() => fileInputRef.current?.click()} style={btnStyle}>导入数据</button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
      </div>
      {msg && (
        <div style={{ marginTop: 8, fontSize: 12, color: msg.includes('失败') ? '#d32f2f' : '#34a853' }}>
          {msg}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 16px', border: '1px solid #ddd', borderRadius: 4,
  background: '#fff', cursor: 'pointer', fontSize: 13,
};
