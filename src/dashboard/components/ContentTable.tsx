import React, { useState, useMemo } from 'react';
import type { IncomeRecord } from '@/shared/types';

interface Props {
  records: IncomeRecord[];
}

type SortField = 'currentIncome' | 'currentRead' | 'currentInteraction' | 'publishDate' | 'title';
type SortDir = 'asc' | 'desc';

export function ContentTable({ records }: Props) {
  const [sortField, setSortField] = useState<SortField>('currentIncome');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const aggregated = useMemo(() => {
    const map = new Map<string, {
      contentId: string; title: string; contentType: string; publishDate: string;
      currentIncome: number; currentRead: number; currentInteraction: number;
    }>();
    for (const r of records) {
      const existing = map.get(r.contentId);
      if (existing) {
        existing.currentIncome += r.currentIncome;
        existing.currentRead += r.currentRead;
        existing.currentInteraction += r.currentInteraction;
      } else {
        map.set(r.contentId, {
          contentId: r.contentId, title: r.title, contentType: r.contentType,
          publishDate: r.publishDate, currentIncome: r.currentIncome,
          currentRead: r.currentRead, currentInteraction: r.currentInteraction,
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

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>内容明细</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
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
              <tr key={item.contentId} style={{ borderBottom: '1px solid #f0f0f0' }}>
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
