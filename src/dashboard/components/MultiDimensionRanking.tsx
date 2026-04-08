import React, { useMemo, useState } from 'react';
import { Card, Segmented, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { IncomeRecord } from '@/shared/types';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';
import { themeColors } from '../theme';

interface Props {
  records: IncomeRecord[];
  onContentClick?: (item: {
    contentId: string;
    contentToken: string;
    contentType: string;
    title: string;
    publishDate: string;
  }) => void;
}

type Dimension = 'income' | 'rpm' | 'growth' | 'engagement';

interface RankItem {
  rank: number;
  contentId: string;
  contentToken: string;
  title: string;
  contentType: string;
  publishDate: string;
  value: number;
  label: string;
}

export function MultiDimensionRanking({ records, onContentClick }: Props) {
  const [dimension, setDimension] = useState<Dimension>('income');

  const rankings = useMemo(() => {
    const contentMap = new Map<
      string,
      {
        contentId: string;
        contentToken: string;
        title: string;
        contentType: string;
        publishDate: string;
        totalIncome: number;
        totalRead: number;
        totalInteraction: number;
        recent7dIncome: number;
        prior7dIncome: number;
      }
    >();

    let maxDate = '';
    for (const r of records) {
      if (r.recordDate > maxDate) maxDate = r.recordDate;
    }
    if (!maxDate) return { income: [], rpm: [], growth: [], engagement: [] };

    const maxDateObj = new Date(maxDate);
    const recent7Start = new Date(maxDateObj);
    recent7Start.setDate(recent7Start.getDate() - 6);
    const prior7Start = new Date(recent7Start);
    prior7Start.setDate(prior7Start.getDate() - 7);

    const toStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const recent7StartStr = toStr(recent7Start);
    const prior7StartStr = toStr(prior7Start);
    const prior7EndStr = toStr(new Date(recent7Start.getTime() - 86400000));

    for (const r of records) {
      let item = contentMap.get(r.contentId);
      if (!item) {
        item = {
          contentId: r.contentId,
          contentToken: r.contentToken,
          title: r.title,
          contentType: r.contentType,
          publishDate: r.publishDate,
          totalIncome: 0,
          totalRead: 0,
          totalInteraction: 0,
          recent7dIncome: 0,
          prior7dIncome: 0,
        };
        contentMap.set(r.contentId, item);
      }
      item.totalIncome += r.currentIncome;
      item.totalRead += r.currentRead;
      item.totalInteraction += r.currentInteraction;

      if (r.recordDate >= recent7StartStr && r.recordDate <= maxDate) {
        item.recent7dIncome += r.currentIncome;
      }
      if (r.recordDate >= prior7StartStr && r.recordDate <= prior7EndStr) {
        item.prior7dIncome += r.currentIncome;
      }
    }

    const items = Array.from(contentMap.values());

    const incomeRank = items
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.totalIncome / 100,
        label: `¥${(item.totalIncome / 100).toFixed(2)}`,
      }));

    const rpmRank = items
      .filter((i) => i.totalRead >= 100)
      .map((i) => ({ ...i, rpm: (i.totalIncome / 100 / i.totalRead) * 1000 }))
      .sort((a, b) => b.rpm - a.rpm)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.rpm,
        label: `¥${item.rpm.toFixed(2)}/千次`,
      }));

    const growthRank = items
      .filter((i) => i.prior7dIncome > 0)
      .map((i) => ({ ...i, growth: ((i.recent7dIncome - i.prior7dIncome) / i.prior7dIncome) * 100 }))
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.growth,
        label: `${item.growth >= 0 ? '+' : ''}${item.growth.toFixed(1)}%`,
      }));

    const engagementRank = items
      .filter((i) => i.totalRead >= 100)
      .map((i) => ({ ...i, rate: (i.totalInteraction / i.totalRead) * 100 }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10)
      .map((item, i) => ({
        rank: i + 1,
        contentId: item.contentId,
        contentToken: item.contentToken,
        title: item.title,
        contentType: item.contentType,
        publishDate: item.publishDate,
        value: item.rate,
        label: `${item.rate.toFixed(2)}%`,
      }));

    return { income: incomeRank, rpm: rpmRank, growth: growthRank, engagement: engagementRank };
  }, [records]);

  const currentRanking = rankings[dimension];

  const columns: ColumnsType<RankItem> = [
    {
      title: '#',
      dataIndex: 'rank',
      key: 'rank',
      width: 40,
      render: (rank: number) => (
        <span style={{ fontWeight: rank <= 3 ? 700 : 400, color: rank <= 3 ? themeColors.warmRed : undefined }}>
          {rank}
        </span>
      ),
    },
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
    {
      title: '指标',
      dataIndex: 'label',
      key: 'label',
      width: 120,
      align: 'right' as const,
      render: (label: string) => <b>{label}</b>,
    },
  ];

  return (
    <Card title="多维度排行" size="small">
      <Segmented
        value={dimension}
        onChange={(v) => setDimension(v as Dimension)}
        options={[
          { label: '收益最高', value: 'income' },
          { label: 'RPM最高', value: 'rpm' },
          { label: '增长最快', value: 'growth' },
          { label: '互动率最高', value: 'engagement' },
        ]}
        style={{ marginBottom: 12 }}
        size="small"
      />
      <Table<RankItem>
        columns={columns}
        dataSource={currentRanking}
        rowKey="contentId"
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () =>
            onContentClick?.({
              contentId: record.contentId,
              contentToken: record.contentToken,
              contentType: record.contentType,
              title: record.title,
              publishDate: record.publishDate,
            }),
          style: { cursor: onContentClick ? 'pointer' : undefined },
        })}
      />
    </Card>
  );
}
