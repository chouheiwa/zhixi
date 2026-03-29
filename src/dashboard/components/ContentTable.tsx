import React, { useState, useMemo, useCallback } from 'react';
import { Table, Tag, Button, Space, Alert, Progress } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { IncomeRecord } from '@/shared/types';
import { useCollector } from '@/hooks/use-collector';
import { themeColors } from '../theme';

export interface ContentTableItem {
  contentId: string;
  contentToken: string;
  title: string;
  contentType: string;
  publishDate: string;
  currentIncome: number;
  currentRead: number;
  currentInteraction: number;
}

interface Props {
  records: IncomeRecord[];
  onContentClick: (item: ContentTableItem) => void;
  onCompare?: (items: ContentTableItem[]) => void;
}

export function ContentTable({ records, onContentClick, onCompare }: Props) {
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [fetchMsg, setFetchMsg] = useState('');
  const { status } = useCollector();

  const aggregated = useMemo(() => {
    const map = new Map<string, ContentTableItem>();
    for (const r of records) {
      const existing = map.get(r.contentId);
      if (existing) {
        existing.currentIncome += r.currentIncome;
        existing.currentRead += r.currentRead;
        existing.currentInteraction += r.currentInteraction;
      } else {
        map.set(r.contentId, {
          contentId: r.contentId,
          contentToken: r.contentToken,
          title: r.title,
          contentType: r.contentType,
          publishDate: r.publishDate,
          currentIncome: r.currentIncome,
          currentRead: r.currentRead,
          currentInteraction: r.currentInteraction,
        });
      }
    }
    return Array.from(map.values());
  }, [records]);

  const handleBatchFetch = useCallback(async () => {
    const items = aggregated.filter(i => selectedKeys.includes(i.contentId)).map(i => ({
      contentId: i.contentId, contentToken: i.contentToken,
      contentType: i.contentType, title: i.title, publishDate: i.publishDate,
    }));
    if (items.length === 0) return;
    setFetchMsg('');
    try {
      const response = await new Promise<{ ok: boolean; count?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchContentDaily', items }, (resp) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(resp);
        });
      });
      if (response.ok) {
        setFetchMsg(`拉取完成，共 ${response.count} 条每日数据`);
        setSelectedKeys([]);
      } else {
        setFetchMsg(`拉取失败: ${response.error}`);
      }
    } catch (err) {
      setFetchMsg(`拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [aggregated, selectedKeys]);

  const columns: ColumnsType<ContentTableItem> = [
    {
      title: '标题', dataIndex: 'title', key: 'title',
      ellipsis: true,
      sorter: (a, b) => a.title.localeCompare(b.title),
    },
    {
      title: '类型', dataIndex: 'contentType', key: 'contentType', width: 80,
      render: (type: string) => (
        <Tag color={type === 'article' ? 'blue' : 'gold'}>
          {type === 'article' ? '文章' : '回答'}
        </Tag>
      ),
      filters: [
        { text: '文章', value: 'article' },
        { text: '回答', value: 'answer' },
      ],
      onFilter: (value, record) => record.contentType === value,
    },
    {
      title: '发布日期', dataIndex: 'publishDate', key: 'publishDate', width: 110,
      sorter: (a, b) => a.publishDate.localeCompare(b.publishDate),
    },
    {
      title: '阅读', dataIndex: 'currentRead', key: 'currentRead', width: 100, align: 'right',
      sorter: (a, b) => a.currentRead - b.currentRead,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '互动', dataIndex: 'currentInteraction', key: 'currentInteraction', width: 80, align: 'right',
      sorter: (a, b) => a.currentInteraction - b.currentInteraction,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '收益', dataIndex: 'currentIncome', key: 'currentIncome', width: 100, align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.currentIncome - b.currentIncome,
      render: (v: number) => <b>¥{(v / 100).toFixed(2)}</b>,
    },
    {
      title: '转化率', key: 'rpm', width: 110, align: 'right',
      sorter: (a, b) => {
        const rpmA = a.currentRead > 0 ? a.currentIncome / a.currentRead : 0;
        const rpmB = b.currentRead > 0 ? b.currentIncome / b.currentRead : 0;
        return rpmA - rpmB;
      },
      render: (_, item) => item.currentRead > 0
        ? `¥${(item.currentIncome / 100 / item.currentRead * 1000).toFixed(2)}/千次`
        : '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        {selectedKeys.length > 0 && (
          <>
            <span style={{ fontSize: 13, color: '#666' }}>已选 {selectedKeys.length} 篇</span>
            <Button
              type="primary" size="small"
              onClick={handleBatchFetch}
              loading={status.isCollecting}
            >
              批量拉取详情
            </Button>
            {onCompare && selectedKeys.length >= 2 && selectedKeys.length <= 3 && (
              <Button
                size="small"
                onClick={() => {
                  const items = aggregated.filter(i => selectedKeys.includes(i.contentId));
                  onCompare(items);
                }}
              >
                对比 ({selectedKeys.length})
              </Button>
            )}
          </>
        )}
      </Space>

      {status.isCollecting && status.currentDate && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: themeColors.warmBlue }}>
            {status.currentDate} ({status.progress}/{status.total})
          </span>
          <Progress
            percent={status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0}
            size="small"
            showInfo={false}
          />
        </div>
      )}

      {fetchMsg && (
        <Alert
          message={fetchMsg}
          type={fetchMsg.includes('失败') ? 'error' : 'success'}
          showIcon closable
          style={{ marginBottom: 8 }}
          onClose={() => setFetchMsg('')}
        />
      )}

      <Table<ContentTableItem>
        columns={columns}
        dataSource={aggregated}
        rowKey="contentId"
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 篇` }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
        }}
        onRow={(record) => ({
          onClick: () => onContentClick(record),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}
