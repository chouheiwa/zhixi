import React, { useState, useRef } from 'react';
import { Card, Button, Space, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
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
      a.download = `zhixi-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    <Card title="数据备份" size="small">
      <Space>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出数据</Button>
        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>导入数据</Button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
      </Space>
      {msg && (
        <Alert
          message={msg}
          type={msg.includes('失败') ? 'error' : 'success'}
          showIcon closable
          style={{ marginTop: 8 }}
          onClose={() => setMsg('')}
        />
      )}
    </Card>
  );
}
