import React, { useState, useRef } from 'react';
import { Card, Button, Space, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { exportToJSON, importFromJSON } from '@/db/export-import';

interface Props {
  onImported: () => void;
}

interface ImportFeedback {
  type: 'success' | 'error';
  message: string;
  description?: string;
}

export function ExportImportPanel({ onImported }: Props) {
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
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
      setFeedback({ type: 'success', message: '导出成功' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `导出失败: ${err instanceof Error ? err.message : '未知错误'}`,
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromJSON(text);

      const tableEntries = Object.entries(result.tables).filter(([, count]) => (count ?? 0) > 0);
      const tableSummary =
        tableEntries.length > 0 ? tableEntries.map(([name, count]) => `${name}: ${count}`).join('，') : undefined;
      const errorSummary =
        result.errors.length > 0
          ? `${result.errors.slice(0, 3).join('；')}${result.errors.length > 3 ? `；另有 ${result.errors.length - 3} 条错误` : ''}`
          : undefined;
      const description = [tableSummary, errorSummary].filter(Boolean).join(' | ') || undefined;

      setFeedback({
        type: 'success',
        message:
          result.skipped > 0
            ? `导入完成，成功 ${result.imported} 条，跳过 ${result.skipped} 条记录`
            : `导入成功，共 ${result.imported} 条记录`,
        description,
      });
      onImported();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `导入失败: ${err instanceof Error ? err.message : '未知错误'}`,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card title="数据备份" size="small">
      <Space>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          导出数据
        </Button>
        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
          导入数据
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
      </Space>
      {feedback && (
        <Alert
          message={feedback.message}
          description={feedback.description}
          type={feedback.type}
          showIcon
          closable
          style={{ marginTop: 8 }}
          onClose={() => setFeedback(null)}
        />
      )}
    </Card>
  );
}
