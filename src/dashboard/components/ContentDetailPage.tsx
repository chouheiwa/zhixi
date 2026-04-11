import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Tabs, Alert, Flex } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { ContentTableItem } from './ContentTable';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { getContentDailyRecords } from '@/db/content-daily-store';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCollector } from '@/hooks/use-collector';
import { LifecycleAnalysis } from './LifecycleAnalysis';
import { ResidualChart } from './ResidualChart';
import { computeRPM, percentileRanks } from '@/shared/stats';
import { contentTypeLabel, contentTypeColor } from '@/shared/content-type';
import { themeColors } from '../theme';

interface Props {
  contentId: string;
  contentToken: string;
  contentType: string;
  title: string;
  publishDate: string;
  onBack: () => void;
  onCompare?: (item: ContentTableItem) => void;
  demoMode?: boolean;
}

// ── Demo data for tour ──
function generateDemoIncomeRecords(): IncomeRecord[] {
  const records: IncomeRecord[] = [];
  const base = new Date();
  base.setDate(base.getDate() - 30);
  let cumIncome = 0,
    cumRead = 0,
    cumInteraction = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const income = Math.round((200 + Math.random() * 600 + (i > 20 ? 150 : 0)) * (1 + Math.sin(i * 0.5) * 0.3));
    const read = Math.round(800 + Math.random() * 1200 + i * 30);
    const interaction = Math.round(10 + Math.random() * 30);
    cumIncome += income;
    cumRead += read;
    cumInteraction += interaction;
    records.push({
      userId: 'demo',
      contentId: 'demo-1',
      contentToken: 'demo-token-1',
      contentType: 'article',
      title: '如何高效学习编程：从零到一的实践指南',
      publishDate: '2025-01-15',
      recordDate: dateStr,
      currentIncome: income,
      currentRead: read,
      currentInteraction: interaction,
      totalIncome: cumIncome,
      totalRead: cumRead,
      totalInteraction: cumInteraction,
      collectedAt: Date.now(),
    });
  }
  return records;
}

function generateDemoDailyRecords(): ContentDailyRecord[] {
  const records: ContentDailyRecord[] = [];
  const base = new Date();
  base.setDate(base.getDate() - 30);
  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    records.push({
      userId: 'demo',
      contentId: 'demo-1',
      contentToken: 'demo-token-1',
      contentType: 'article',
      title: '如何高效学习编程：从零到一的实践指南',
      date: dateStr,
      pv: Math.round(800 + Math.random() * 1200 + i * 30),
      show: Math.round(3000 + Math.random() * 2000),
      upvote: Math.round(5 + Math.random() * 15),
      comment: Math.round(1 + Math.random() * 5),
      like: Math.round(Math.random() * 5),
      collect: Math.round(2 + Math.random() * 8),
      share: Math.round(Math.random() * 3),
      play: 0,
      collectedAt: Date.now(),
    });
  }
  return records;
}

const DEMO_INCOME_RECORDS = generateDemoIncomeRecords();
const DEMO_DAILY_RECORDS = generateDemoDailyRecords();

interface IncomeTooltipParam {
  name: string;
  value: number;
}

type Metric = 'pv' | 'show' | 'upvote' | 'comment' | 'collect' | 'share';

const ALL_METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'pv', label: '阅读量', color: themeColors.warmBlue },
  { key: 'show', label: '曝光量', color: '#999' },
  { key: 'upvote', label: '点赞', color: themeColors.warmRed },
  { key: 'comment', label: '评论', color: themeColors.sage },
  { key: 'collect', label: '收藏', color: themeColors.amberLight },
  { key: 'share', label: '分享', color: '#8b7bb5' },
];

export function ContentDetailPage({
  contentId,
  contentToken,
  contentType,
  title,
  publishDate,
  onBack,
  onCompare,
  demoMode,
}: Props) {
  const { user } = useCurrentUser();
  const { status } = useCollector();
  const [dailyRecords, setDailyRecords] = useState<ContentDailyRecord[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [fetchMsg, setFetchMsg] = useState('');

  const loadData = () => {
    if (!user || demoMode) return;
    // Load daily metrics and income records from DB independently
    getContentDailyRecords(user.id, contentToken).then(setDailyRecords);
    db.incomeRecords
      .where('[userId+contentId+recordDate]')
      .between([user.id, contentId, ''], [user.id, contentId, '\uffff'])
      .sortBy('recordDate')
      .then(setIncomeRecords);
  };

  useEffect(() => {
    if (demoMode) {
      setIncomeRecords(DEMO_INCOME_RECORDS);
      setDailyRecords(DEMO_DAILY_RECORDS);
      return;
    }
    loadData();
  }, [user, contentToken, contentId, demoMode]);

  // Reload when collection finishes
  const prevCollecting = React.useRef(status.isCollecting);
  useEffect(() => {
    if (demoMode) return;
    if (prevCollecting.current && !status.isCollecting) loadData();
    prevCollecting.current = status.isCollecting;
  }, [status.isCollecting, demoMode]);

  // Income summary
  const incomeSummary = useMemo(() => {
    let totalIncome = 0,
      totalRead = 0,
      totalInteraction = 0;
    for (const r of incomeRecords) {
      totalIncome += r.currentIncome;
      totalRead += r.currentRead;
      totalInteraction += r.currentInteraction;
    }
    const rpm = computeRPM(totalIncome / 100, totalRead);
    return { totalIncome, totalRead, totalInteraction, days: incomeRecords.length, rpm };
  }, [incomeRecords]);

  // Daily summary from daily records
  const dailySummary = useMemo(() => {
    let totalPv = 0,
      totalUpvote = 0,
      totalComment = 0,
      totalCollect = 0,
      totalShare = 0,
      totalShow = 0;
    for (const r of dailyRecords) {
      totalPv += r.pv;
      totalUpvote += r.upvote;
      totalComment += r.comment;
      totalCollect += r.collect;
      totalShare += r.share;
      totalShow += r.show;
    }
    return { totalPv, totalUpvote, totalComment, totalCollect, totalShare, totalShow };
  }, [dailyRecords]);

  const handleFetchDaily = async () => {
    setFetchMsg('');
    try {
      const response = await new Promise<{ ok: boolean; count?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'fetchContentDaily', items: [{ contentId, contentToken, contentType, title, publishDate }] },
          (resp: { ok: boolean; count?: number; error?: string }) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(resp);
          },
        );
      });
      if (response.ok) {
        setFetchMsg(`拉取完成，共 ${response.count} 条数据`);
        loadData();
      } else {
        setFetchMsg(`拉取失败: ${response.error}`);
      }
    } catch (err) {
      setFetchMsg(`拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // Income trend (from income records)
  const incomeTrendOption = useMemo(() => {
    if (incomeRecords.length === 0) return null;
    const sorted = [...incomeRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: IncomeTooltipParam[]) => `${params[0].name}<br/>¥${(params[0].value / 100).toFixed(2)}`,
      },
      grid: withZoomGrid({ left: 50, right: 30, top: 20, bottom: 30 }),
      xAxis: { type: 'category' as const, data: sorted.map((r) => r.recordDate.slice(5)), axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => `¥${(v / 100).toFixed(0)}` } },
      series: [
        {
          type: 'bar',
          data: sorted.map((r) => r.currentIncome),
          itemStyle: { color: themeColors.warmBlue, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 20,
        },
      ],
      ...timeSeriesZoom,
    };
  }, [incomeRecords]);

  return (
    <div>
      {/* Header */}
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
          <Flex align="center" gap={8} style={{ marginTop: 4 }}>
            <Tag color={contentTypeColor(contentType)}>{contentTypeLabel(contentType)}</Tag>
            <span style={{ fontSize: 12, color: '#999' }}>发布于 {publishDate}</span>
          </Flex>
        </div>
        {onCompare && (
          <Button
            size="small"
            onClick={() =>
              onCompare({
                contentId,
                contentToken,
                contentType,
                title,
                publishDate,
                currentIncome: 0,
                currentRead: 0,
                currentInteraction: 0,
              })
            }
            style={{ marginLeft: 8 }}
          >
            添加到对比
          </Button>
        )}
      </Flex>

      {/* Summary stats */}
      <Row id="tour-detail-stats" gutter={[10, 10]} style={{ marginBottom: 20 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="总收益"
              value={incomeSummary.totalIncome / 100}
              precision={2}
              prefix="¥"
              valueStyle={{ color: themeColors.warmBlue, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="千次阅读收益" value={incomeSummary.rpm} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="总阅读" value={incomeSummary.totalRead} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="总互动" value={incomeSummary.totalInteraction} />
          </Card>
        </Col>
        {dailyRecords.length > 0 && (
          <>
            <Col span={4}>
              <Card size="small">
                <Statistic title="总点赞" value={dailySummary.totalUpvote} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="总评论" value={dailySummary.totalComment} />
              </Card>
            </Col>
          </>
        )}
      </Row>

      {/* Tabs */}
      <Tabs
        id="tour-detail-tabs"
        defaultActiveKey="income"
        type="card"
        items={[
          {
            key: 'income',
            label: '收益趋势',
            children: (
              <Flex vertical gap={16}>
                {incomeTrendOption && (
                  <Card id="tour-detail-income-trend" title="每日收益" size="small">
                    <ReactECharts option={incomeTrendOption} style={{ height: 250 }} />
                  </Card>
                )}
                {incomeRecords.length >= 5 && <LifecycleAnalysis incomeRecords={incomeRecords} />}
                {dailyRecords.length >= 5 && incomeRecords.length >= 5 && (
                  <ResidualChart incomeRecords={incomeRecords} dailyRecords={dailyRecords} />
                )}
              </Flex>
            ),
          },
          {
            key: 'daily',
            label: '每日数据详情',
            children: (
              <div>
                <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                  <div>
                    {status.isCollecting && (
                      <span style={{ fontSize: 12, color: themeColors.warmBlue }}>
                        {status.currentDate} ({status.progress}/{status.total})
                      </span>
                    )}
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleFetchDaily}
                    loading={status.isCollecting}
                  >
                    {status.isCollecting ? '拉取中...' : dailyRecords.length > 0 ? '更新数据' : '拉取数据'}
                  </Button>
                </Flex>

                {fetchMsg && (
                  <Alert
                    message={fetchMsg}
                    type={fetchMsg.includes('失败') ? 'error' : 'success'}
                    showIcon
                    closable
                    style={{ marginBottom: 12 }}
                    onClose={() => setFetchMsg('')}
                  />
                )}

                {dailyRecords.length > 0 ? (
                  <Row gutter={[16, 16]}>
                    {ALL_METRICS.map(({ key, label, color }) => {
                      const dates = dailyRecords.map((r) => r.date);
                      const incomeMap = new Map(incomeRecords.map((r) => [r.recordDate, r.currentIncome]));
                      const incomeData = dates.map((d) => (incomeMap.get(d) ?? 0) / 100);
                      return (
                        <Col span={12} key={key}>
                          <MetricChart
                            label={label}
                            color={color}
                            data={dailyRecords.map((r) => r[key])}
                            incomeData={incomeData}
                            dates={dates.map((d) => d.slice(5))}
                          />
                        </Col>
                      );
                    })}
                  </Row>
                ) : (
                  <Card style={{ textAlign: 'center', color: '#999' }}>
                    暂无每日详细数据，点击上方"拉取数据"按钮获取
                  </Card>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function MetricChart({
  label,
  color,
  data,
  incomeData,
  dates,
}: {
  label: string;
  color: string;
  data: number[];
  incomeData: number[];
  dates: string[];
}) {
  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [label, '收益'], textStyle: { fontSize: 11 }, right: 0, top: 0 },
    grid: withZoomGrid({ left: 45, right: 50, top: 30, bottom: 25 }),
    title: { text: label, textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value' as const, axisLabel: { fontSize: 10 }, splitNumber: 3, position: 'left' as const },
      {
        type: 'value' as const,
        axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v}` },
        splitNumber: 3,
        position: 'right' as const,
      },
    ],
    series: [
      {
        name: label,
        type: 'line',
        data,
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color },
        lineStyle: { width: 2 },
        areaStyle: { color: `${color}18` },
      },
      {
        name: '收益',
        type: 'bar',
        data: incomeData,
        yAxisIndex: 1,
        itemStyle: { color: 'rgba(91, 122, 157, 0.25)', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 8,
      },
    ],
    ...timeSeriesZoom,
  };
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 8px 0' }}>
      <ReactECharts option={option} style={{ height: 220 }} />
    </div>
  );
}
