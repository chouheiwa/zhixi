import React, { useState, useCallback } from 'react';
import { Card, Button, Table, Tag, Flex, Alert, Empty } from 'antd';
import { FileSearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CreationItem } from '@/api/zhihu-creations';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';

interface Props {
  /** Content tokens (url_token) that have income records */
  monetizedContentTokens: Set<string>;
}

export function UnmonetizedContentPanel({ monetizedContentTokens }: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CreationItem[] | null>(null);
  const [error, setError] = useState('');

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await new Promise<{ ok: boolean; items?: CreationItem[]; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'fetchAllCreations' },
          (r: { ok: boolean; items?: CreationItem[]; error?: string }) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(r);
          },
        );
      });

      if (!resp.ok || !resp.items) {
        setError(resp.error ?? '获取失败');
        return;
      }

      // Filter: only show content NOT in monetizedContentTokens
      // Creations API uses url_token as contentToken, income API also stores url_token as contentToken
      const unmonetized = resp.items.filter((item) => !monetizedContentTokens.has(item.contentToken));
      setItems(unmonetized);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取失败');
    } finally {
      setLoading(false);
    }
  }, [monetizedContentTokens]);

  return (
    <Card
      title={
        <>
          <FileSearchOutlined /> 未产生收益的内容
        </>
      }
      size="small"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={handleFetch} loading={loading}>
          {items !== null ? '刷新' : '获取列表'}
        </Button>
      }
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

      {items === null ? (
        <Flex justify="center" style={{ padding: 16, color: '#999', fontSize: 13 }}>
          点击右上角按钮，获取所有已发表内容并筛选出未产生收益的
        </Flex>
      ) : items.length === 0 ? (
        <Empty description="所有内容都已产生收益" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            共 {items.length} 篇内容尚未被致知计划收录或产生收益
          </div>
          <Table
            dataSource={items}
            rowKey="contentId"
            size="small"
            pagination={items.length > 10 ? { pageSize: 10, size: 'small' } : false}
            columns={[
              {
                title: '内容',
                dataIndex: 'title',
                key: 'title',
                ellipsis: true,
                render: (title: string, row) => (
                  <span>
                    <Tag color={contentTypeColor(row.contentType)} style={{ marginRight: 4 }}>
                      {contentTypeLabel(row.contentType)}
                    </Tag>
                    {title}
                  </span>
                ),
              },
              { title: '发布日期', dataIndex: 'publishDate', key: 'publishDate', width: 100 },
              {
                title: '阅读',
                dataIndex: 'readCount',
                key: 'readCount',
                width: 70,
                align: 'right' as const,
                sorter: (a, b) => a.readCount - b.readCount,
                render: (v: number) => v.toLocaleString(),
              },
              {
                title: '点赞',
                dataIndex: 'upvoteCount',
                key: 'upvoteCount',
                width: 60,
                align: 'right' as const,
                sorter: (a, b) => a.upvoteCount - b.upvoteCount,
              },
              { title: '评论', dataIndex: 'commentCount', key: 'commentCount', width: 60, align: 'right' as const },
              { title: '收藏', dataIndex: 'collectCount', key: 'collectCount', width: 60, align: 'right' as const },
            ]}
          />
        </>
      )}
    </Card>
  );
}
