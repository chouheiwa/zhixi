import React, { useState, useEffect, useMemo } from 'react';
import { Card, Tag, Row, Col, Table, Flex, Empty, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { getContentDailyRecords } from '@/db/content-daily-store';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface ContentOption {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
}

interface Props {
  initialItems?: ContentOption[];
  allContentOptions: ContentOption[];
  onBack: () => void;
}

const COLORS = [themeColors.warmBlue, themeColors.warmRed, themeColors.sage];

export function ContentComparePage({ initialItems, allContentOptions, onBack }: Props) {
  const { user } = useCurrentUser();
  const currency = useCurrency();
  const [selected, setSelected] = useState<ContentOption[]>(initialItems ?? []);
  const [dailyMap, setDailyMap] = useState<Map<string, ContentDailyRecord[]>>(new Map());
  const [incomeMap, setIncomeMap] = useState<Map<string, IncomeRecord[]>>(new Map());

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const newDailyMap = new Map<string, ContentDailyRecord[]>();
      const newIncomeMap = new Map<string, IncomeRecord[]>();

      for (const item of selected) {
        const daily = await getContentDailyRecords(user.id, item.contentToken);
        newDailyMap.set(
          item.contentId,
          daily.sort((a, b) => a.date.localeCompare(b.date)),
        );

        const income = await db.incomeRecords
          .where('[userId+contentId+recordDate]')
          .between([user.id, item.contentId, ''], [user.id, item.contentId, '\uffff'])
          .sortBy('recordDate');
        newIncomeMap.set(item.contentId, income);
      }

      setDailyMap(newDailyMap);
      setIncomeMap(newIncomeMap);
    };
    loadData();
  }, [user, selected]);

  const handleAdd = (contentId: string) => {
    if (selected.length >= 3) return;
    const item = allContentOptions.find((o) => o.contentId === contentId);
    if (item && !selected.find((s) => s.contentId === contentId)) {
      setSelected([...selected, item]);
    }
  };

  const handleRemove = (contentId: string) => {
    setSelected(selected.filter((s) => s.contentId !== contentId));
  };

  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const records of dailyMap.values()) {
      for (const r of records) dateSet.add(r.date);
    }
    for (const records of incomeMap.values()) {
      for (const r of records) dateSet.add(r.recordDate);
    }
    return Array.from(dateSet).sort();
  }, [dailyMap, incomeMap]);

  const makeLineChart = (title: string, getData: (contentId: string, date: string) => number) => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: selected.map((s) => s.title.slice(0, 15)), textStyle: { fontSize: 10 }, right: 0 },
    grid: withZoomGrid({ left: 50, right: 20, top: 30, bottom: 25 }),
    xAxis: { type: 'category' as const, data: allDates.map((d) => d.slice(5)), axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3 },
    series: selected.map((item, idx) => ({
      name: item.title.slice(0, 15),
      type: 'line',
      data: allDates.map((d) => getData(item.contentId, d)),
      smooth: true,
      itemStyle: { color: COLORS[idx] },
      lineStyle: { width: 2 },
      symbol: 'none',
    })),
    ...timeSeriesZoom,
  });

  const readChart = makeLineChart('每日阅读', (cid, date) => {
    const records = dailyMap.get(cid);
    const r = records?.find((r) => r.date === date);
    return r?.pv ?? 0;
  });

  const incomeChart = makeLineChart('每日收益', (cid, date) => {
    const records = incomeMap.get(cid);
    const r = records?.find((r) => r.recordDate === date);
    return r ? currency.convert(r.currentIncome) : 0;
  });

  const cumulativeChart = (() => {
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: selected.map((s) => s.title.slice(0, 15)), textStyle: { fontSize: 10 }, right: 0 },
      grid: withZoomGrid({ left: 50, right: 20, top: 30, bottom: 25 }),
      xAxis: { type: 'category' as const, data: allDates.map((d) => d.slice(5)), axisLabel: { fontSize: 9 } },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(v) },
        splitNumber: 3,
      },
      series: selected.map((item, idx) => {
        let running = 0;
        return {
          name: item.title.slice(0, 15),
          type: 'line',
          data: allDates.map((d) => {
            const inc = incomeMap.get(item.contentId)?.find((r) => r.recordDate === d);
            if (inc) running += currency.convert(inc.currentIncome);
            return running;
          }),
          smooth: true,
          itemStyle: { color: COLORS[idx] },
          lineStyle: { width: 2 },
          symbol: 'none',
          areaStyle: { opacity: 0.05 },
        };
      }),
      ...timeSeriesZoom,
    };
  })();

  const summaryData = useMemo(() => {
    const metrics = ['总收益', '总阅读', 'RPM', '平均日收益', '互动率'];
    return metrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      for (const item of selected) {
        const incomes = incomeMap.get(item.contentId) ?? [];
        const totalIncome = incomes.reduce((sum, r) => sum + r.currentIncome, 0);
        const totalRead = incomes.reduce((sum, r) => sum + r.currentRead, 0);
        const totalInteraction = incomes.reduce((sum, r) => sum + r.currentInteraction, 0);
        const days = incomes.length;

        let value: string;
        switch (metric) {
          case '总收益':
            value = currency.format(totalIncome);
            break;
          case '总阅读':
            value = totalRead.toLocaleString();
            break;
          case 'RPM':
            value =
              totalRead > 0
                ? `${currency.rpmPfx}${((currency.convert(totalIncome) / totalRead) * 1000).toFixed(currency.precision)}${currency.rpmSfx}`
                : '-';
            break;
          case '平均日收益':
            value =
              days > 0
                ? `${currency.prefix}${(currency.convert(totalIncome) / days).toFixed(currency.precision)}${currency.suffix}`
                : '-';
            break;
          case '互动率':
            value = totalRead > 0 ? `${((totalInteraction / totalRead) * 100).toFixed(2)}%` : '-';
            break;
          default:
            value = '-';
        }
        row[item.contentId] = value;
      }
      return row;
    });
  }, [selected, incomeMap]);

  const [searchText, setSearchText] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchText) return allContentOptions;
    const lower = searchText.toLowerCase();
    return allContentOptions.filter((o) => o.title.toLowerCase().includes(lower));
  }, [allContentOptions, searchText]);

  const selectedKeys = useMemo(() => selected.map((s) => s.contentId), [selected]);

  const listColumns: ColumnsType<ContentOption> = [
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
  ];

  return (
    <div>
      {/* Selected items */}
      {selected.length > 0 && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Flex gap={8} wrap="wrap" align="center">
            <span style={{ fontSize: 12, color: '#999' }}>已选：</span>
            {selected.map((item, idx) => (
              <Tag key={item.contentId} color={COLORS[idx]} closable onClose={() => handleRemove(item.contentId)}>
                {item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title}
              </Tag>
            ))}
          </Flex>
        </Card>
      )}

      {/* Content selection list */}
      <Card
        size="small"
        title={`选择要对比的内容（最多3篇，已选 ${selected.length}/3）`}
        style={{ marginBottom: 16 }}
        extra={
          <Input.Search
            placeholder="搜索内容"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="small"
            style={{ width: 200 }}
          />
        }
      >
        <Table<ContentOption>
          columns={listColumns}
          dataSource={filteredOptions}
          rowKey="contentId"
          size="small"
          pagination={filteredOptions.length > 8 ? { pageSize: 8, size: 'small' } : false}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (newKeys) => {
              const newSelected = allContentOptions.filter((o) => (newKeys as string[]).includes(o.contentId));
              setSelected(newSelected.slice(0, 3));
            },
            getCheckboxProps: (record) => ({
              disabled: selected.length >= 3 && !selected.find((s) => s.contentId === record.contentId),
            }),
          }}
          onRow={(record) => ({
            onClick: () => {
              if (selected.find((s) => s.contentId === record.contentId)) {
                handleRemove(record.contentId);
              } else if (selected.length < 3) {
                setSelected([...selected, record]);
              }
            },
            style: {
              cursor:
                selected.length >= 3 && !selected.find((s) => s.contentId === record.contentId) ? undefined : 'pointer',
            },
          })}
        />
      </Card>

      {selected.length < 2 ? (
        <Empty description="请选择至少 2 篇内容进行对比" style={{ padding: 24 }} />
      ) : (
        <>
          <Row gutter={16}>
            <Col span={12}>
              <Card title="每日阅读量对比" size="small">
                <ReactECharts option={readChart} style={{ height: 220 }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="每日收益对比" size="small">
                <ReactECharts option={incomeChart} style={{ height: 220 }} />
              </Card>
            </Col>
          </Row>
          <Card title="累计收益对比" size="small" style={{ marginTop: 16 }}>
            <ReactECharts option={cumulativeChart} style={{ height: 220 }} />
          </Card>
          <Card title="指标汇总" size="small" style={{ marginTop: 16 }}>
            <Table
              dataSource={summaryData}
              rowKey="metric"
              size="small"
              pagination={false}
              columns={[
                { title: '指标', dataIndex: 'metric', key: 'metric', width: 100 },
                ...selected.map((item, idx) => ({
                  title: (
                    <span>
                      <Tag color={COLORS[idx]} style={{ marginRight: 4 }}>
                        {contentTypeLabel(item.contentType)}
                      </Tag>
                      {item.title.length > 12 ? item.title.slice(0, 12) + '...' : item.title}
                    </span>
                  ),
                  dataIndex: item.contentId,
                  key: item.contentId,
                  align: 'right' as const,
                })),
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
