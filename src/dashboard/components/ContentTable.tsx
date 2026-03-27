import React, { useState, useMemo, useCallback } from 'react';
import type { IncomeRecord } from '@/shared/types';
import { useCollector } from '@/hooks/use-collector';

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
}

type SortField = 'currentIncome' | 'currentRead' | 'currentInteraction' | 'publishDate' | 'title';
type SortDir = 'asc' | 'desc';

export function ContentTable({ records, onContentClick }: Props) {
  const [sortField, setSortField] = useState<SortField>('currentIncome');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const sorted = useMemo(() => {
    return [...aggregated].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [aggregated, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIcon = (field: SortField) => sortField !== field ? '' : sortDir === 'asc' ? ' ↑' : ' ↓';

  const toggleSelect = (contentId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(contentId)) next.delete(contentId); else next.add(contentId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map(i => i.contentId)));
  };

  const handleBatchFetch = useCallback(async () => {
    const items = aggregated.filter(i => selected.has(i.contentId)).map(i => ({
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
        setSelected(new Set());
        setSelectMode(false);
      } else {
        setFetchMsg(`拉取失败: ${response.error}`);
      }
    } catch (err) {
      setFetchMsg(`拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [aggregated, selected]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>内容明细</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectMode && selected.size > 0 && (
            <span style={{ fontSize: 12, color: '#666' }}>已选 {selected.size} 篇</span>
          )}
          {selectMode && (
            <button onClick={handleBatchFetch}
              disabled={selected.size === 0 || status.isCollecting}
              style={{
                padding: '4px 12px', fontSize: 12, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: selected.size > 0 ? '#1a73e8' : '#ccc', color: '#fff',
                opacity: (selected.size === 0 || status.isCollecting) ? 0.6 : 1,
              }}>
              {status.isCollecting ? '拉取中...' : '批量拉取详情'}
            </button>
          )}
          <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
            style={{
              padding: '4px 12px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4,
              background: selectMode ? '#f0f0f0' : '#fff', cursor: 'pointer',
            }}>
            {selectMode ? '取消选择' : '批量操作'}
          </button>
        </div>
      </div>

      {status.isCollecting && status.currentDate && (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#1a73e8' }}>
          {status.currentDate} ({status.progress}/{status.total})
          <div style={{ marginTop: 3, height: 3, background: '#e0e0e0', borderRadius: 2 }}>
            <div style={{ height: '100%', background: '#1a73e8', borderRadius: 2,
              width: `${status.total > 0 ? (status.progress / status.total) * 100 : 0}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {fetchMsg && (
        <div style={{ marginBottom: 8, fontSize: 12, color: fetchMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
          {fetchMsg}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              {selectMode && (
                <th style={{ ...thStyle, width: 30 }}>
                  <input type="checkbox" checked={sorted.length > 0 && selected.size === sorted.length}
                    onChange={toggleAll} />
                </th>
              )}
              <th style={thStyle} onClick={() => toggleSort('title')}>标题{sortIcon('title')}</th>
              <th style={thStyle}>类型</th>
              <th style={thStyle} onClick={() => toggleSort('publishDate')}>发布日期{sortIcon('publishDate')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('currentRead')}>阅读{sortIcon('currentRead')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('currentInteraction')}>互动{sortIcon('currentInteraction')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('currentIncome')}>收益{sortIcon('currentIncome')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>转化率</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.contentId}
                onClick={() => !selectMode && onContentClick(item)}
                style={{
                  borderBottom: '1px solid #f0f0f0',
                  cursor: selectMode ? undefined : 'pointer',
                  background: selected.has(item.contentId) ? '#f0f7ff' : undefined,
                }}
                onMouseEnter={(e) => { if (!selectMode) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { if (!selectMode && !selected.has(item.contentId)) e.currentTarget.style.background = ''; }}
              >
                {selectMode && (
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(item.contentId)}
                      onChange={() => toggleSelect(item.contentId)} />
                  </td>
                )}
                <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 3, fontSize: 11,
                    background: item.contentType === 'article' ? '#e8f0fe' : '#fef7e0',
                    color: item.contentType === 'article' ? '#1a73e8' : '#f9a825',
                  }}>
                    {item.contentType === 'article' ? '文章' : '回答'}
                  </span>
                </td>
                <td style={tdStyle}>{item.publishDate}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{item.currentRead.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{item.currentInteraction.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>¥{(item.currentIncome / 100).toFixed(2)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {item.currentRead > 0 ? `¥${(item.currentIncome / 100 / item.currentRead * 1000).toFixed(2)}/千次` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 12px' };
