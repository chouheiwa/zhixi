import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Button, Table, Tag, Flex, Alert, Empty, Tooltip, message } from 'antd';
import { FileSearchOutlined, ReloadOutlined, SyncOutlined, LoadingOutlined } from '@ant-design/icons';
import type { CreationItem } from '@/api/zhihu-creations';
import type { CreationRecord } from '@/db/database';
import type { LoadCreationsCacheResponse, RefreshCreationsResponse } from '@/shared/message-types';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';

/** Skip auto-incremental refresh if the cache was refreshed within this window. */
const AUTO_REFRESH_TTL_MS = 5 * 60 * 1000;

/**
 * Convert a CreationRecord to the shape the legacy CreationItem rendering
 * expects. CreationRecord is a strict superset so this is a no-op cast.
 */
function toCreationItem(row: CreationRecord): CreationItem {
  return {
    contentId: row.contentId,
    contentToken: row.contentToken,
    contentType: row.contentType,
    title: row.title,
    publishDate: row.publishDate,
    readCount: row.readCount,
    upvoteCount: row.upvoteCount,
    commentCount: row.commentCount,
    collectCount: row.collectCount,
  };
}

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return '从未同步';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

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

function sendMessage<T>(request: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (resp: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(resp);
    });
  });
}

export function UnmonetizedContentPanel({ monetizedContentTokens, demoMode }: Props) {
  const [items, setItems] = useState<CreationRecord[] | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<false | 'incremental' | 'force'>(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasAutoRefreshedRef = useRef(false);

  const runRefresh = useCallback(async (mode: 'incremental' | 'force', silent = false): Promise<void> => {
    if (!silent) setRefreshing(mode);
    if (silent) setBackgroundRefreshing(true);
    setError('');
    try {
      const resp = await sendMessage<RefreshCreationsResponse>({ action: 'refreshCreations', mode });
      if (!resp.ok) {
        setError(resp.error);
        if (!silent) message.error(`刷新失败: ${resp.error}`);
        return;
      }
      setItems(resp.items);
      setLastSyncedAt(resp.lastSyncedAt);

      if (mode === 'incremental') {
        if (resp.addedCount > 0) {
          message.success(`已新增 ${resp.addedCount} 条内容`);
        } else if (!silent) {
          message.info('没有新发布的内容');
        }
      } else {
        const parts = [`已更新 ${resp.addedCount} 条`];
        if (resp.deletedCount > 0) parts.push(`清理 ${resp.deletedCount} 条已删除`);
        message.success(parts.join('，'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '刷新失败';
      setError(msg);
      if (!silent) message.error(`刷新失败: ${msg}`);
    } finally {
      if (!silent) setRefreshing(false);
      if (silent) setBackgroundRefreshing(false);
    }
  }, []);

  // Mount: load cache immediately, then optionally kick off a background incremental refresh.
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;

    (async () => {
      try {
        const resp = await sendMessage<LoadCreationsCacheResponse>({ action: 'loadCreationsCache' });
        if (cancelled) return;
        if (!resp.ok) {
          setError(resp.error);
          return;
        }
        setItems(resp.items);
        setLastSyncedAt(resp.lastSyncedAt);

        // Weak TTL: skip auto refresh if last sync was very recent
        const fresh = resp.lastSyncedAt && Date.now() - resp.lastSyncedAt < AUTO_REFRESH_TTL_MS;
        if (fresh) return;
        if (hasAutoRefreshedRef.current) return;
        hasAutoRefreshedRef.current = true;
        await runRefresh('incremental', true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '读取缓存失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demoMode, runRefresh]);

  const handleIncrementalClick = useCallback(() => {
    void runRefresh('incremental', false);
  }, [runRefresh]);

  const handleForceClick = useCallback(() => {
    void runRefresh('force', false);
  }, [runRefresh]);

  // Filter + normalize for rendering
  const displayItems: CreationItem[] | null = demoMode
    ? DEMO_UNMONETIZED
    : items
      ? items.filter((row) => !monetizedContentTokens.has(row.contentToken)).map(toCreationItem)
      : null;

  const showFooterMeta = !demoMode && items !== null;

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
          <Flex gap={4}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleIncrementalClick}
              loading={refreshing === 'incremental'}
              disabled={refreshing !== false}
            >
              {items !== null ? '刷新' : '获取列表'}
            </Button>
            <Tooltip title="完整扫描全部内容并清理已删除的项，请求次数较多，用于偶尔的对账">
              <Button
                size="small"
                icon={<SyncOutlined />}
                onClick={handleForceClick}
                loading={refreshing === 'force'}
                disabled={refreshing !== false}
              >
                深度同步
              </Button>
            </Tooltip>
          </Flex>
        )
      }
    >
      {error && !demoMode && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} closable />}

      {displayItems === null ? (
        <Flex justify="center" style={{ padding: 16, color: '#999', fontSize: 13 }}>
          正在读取缓存...
        </Flex>
      ) : displayItems.length === 0 ? (
        <Empty description="所有内容都已产生收益" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            共 {displayItems.length} 篇内容尚未被致知计划收录或产生收益
            {showFooterMeta && (
              <>
                {' · '}上次同步于 {formatRelativeTime(lastSyncedAt)}
                {backgroundRefreshing && (
                  <>
                    {' '}
                    <LoadingOutlined style={{ marginLeft: 4 }} />
                    <span style={{ marginLeft: 4 }}>后台刷新中...</span>
                  </>
                )}
              </>
            )}
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
