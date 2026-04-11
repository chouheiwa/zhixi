import React, { useState, useCallback } from 'react';
import { Card, Button, Table, Tag, Flex, Alert, Empty } from 'antd';
import { FileSearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CreationItem } from '@/api/zhihu-creations';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';

const DEMO_UNMONETIZED: CreationItem[] = [
  {
    contentId: 'demo-unmon-1',
    contentToken: 'demo-unmon-token-1',
    contentType: 'article',
    title: '我的 2024 年度技术总结：从 React 到全栈的成长之路',
    publishDate: '2024-12-28',
    readCount: 1520,
    upvoteCount: 42,
    commentCount: 8,
    collectCount: 15,
  },
  {
    contentId: 'demo-unmon-2',
    contentToken: 'demo-unmon-token-2',
    contentType: 'answer',
    title: '如何看待 2025 年前端技术发展趋势？',
    publishDate: '2025-01-15',
    readCount: 860,
    upvoteCount: 23,
    commentCount: 5,
    collectCount: 7,
  },
  {
    contentId: 'demo-unmon-3',
    contentToken: 'demo-unmon-token-3',
    contentType: 'pin',
    title: '推荐一个超好用的 VS Code 插件，写代码效率翻倍',
    publishDate: '2025-02-10',
    readCount: 320,
    upvoteCount: 18,
    commentCount: 3,
    collectCount: 2,
  },
];

interface Props {
  /** Content tokens (url_token) that have income records */
  monetizedContentTokens: Set<string>;
  demoMode?: boolean;
}

export function UnmonetizedContentPanel({ monetizedContentTokens, demoMode }: Props) {
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

  const displayItems = demoMode ? DEMO_UNMONETIZED : items;

  return (
    <Card
      title={
        <>
          <FileSearchOutlined /> 未产生收益的内容
        </>
      }
      size="small"
      extra={
        !demoMode && (
          <Button size="small" icon={<ReloadOutlined />} onClick={handleFetch} loading={loading}>
            {items !== null ? '刷新' : '获取列表'}
          </Button>
        )
      }
    >
      {error && !demoMode && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

      {displayItems === null ? (
        <Flex justify="center" style={{ padding: 16, color: '#999', fontSize: 13 }}>
          点击右上角按钮，获取所有已发表内容并筛选出未产生收益的
        </Flex>
      ) : displayItems.length === 0 ? (
        <Empty description="所有内容都已产生收益" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            共 {displayItems.length} 篇内容尚未被致知计划收录或产生收益
          </div>
          <Table
            dataSource={displayItems}
            rowKey="contentId"
            size="small"
            pagination={displayItems.length > 10 ? { pageSize: 10, size: 'small' } : false}
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
