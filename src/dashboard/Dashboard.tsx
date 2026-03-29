import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Layout, Tabs, Spin, Empty, Row, Col, Statistic, Card, Flex, DatePicker, Space, Button, theme, Dropdown, Progress, Alert, Modal } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, DownloadOutlined, UploadOutlined, SettingOutlined, DatabaseOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getAllDailySummaries } from '@/db/income-store';
import { db } from '@/db/database';
import type { DailySummary, IncomeRecord } from '@/shared/types';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useCollector } from '@/hooks/use-collector';
import { exportToJSON, importFromJSON } from '@/db/export-import';
import { DailyTrendChart } from './components/DailyTrendChart';
import { ContentTable, type ContentTableItem } from './components/ContentTable';
import { ContentDetailPage } from './components/ContentDetailPage';
import { RPMForecastPanel } from './components/RPMForecastPanel';
import { WeeklySeasonalityChart } from './components/WeeklySeasonalityChart';
import { MLPredictionPanel } from './components/MLPredictionPanel';
import { AnomalyDetectionPanel } from './components/AnomalyDetectionPanel';
import { UnmonetizedContentPanel } from './components/UnmonetizedContentPanel';
import { ContentTypeComparisonPanel } from './components/ContentTypeComparisonPanel';
import { PublishTimeAnalysis } from './components/PublishTimeAnalysis';
import { MultiDimensionRanking } from './components/MultiDimensionRanking';
import { IncomeGoalPanel } from './components/IncomeGoalPanel';
import { ContentComparePage } from './components/ContentComparePage';

const { Content } = Layout;
const { RangePicker } = DatePicker;
const { useToken } = theme;

const quickRanges: Record<string, [Dayjs, Dayjs]> = {
  '昨日': [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')],
  '最近7天': [dayjs().subtract(7, 'day'), dayjs()],
  '最近30天': [dayjs().subtract(30, 'day'), dayjs()],
  '最近90天': [dayjs().subtract(90, 'day'), dayjs()],
};

export function Dashboard() {
  const { start: defaultStart, end: defaultEnd } = getDateRange(30);
  const [startDate, setStartDate] = useState(formatDate(defaultStart));
  const [endDate, setEndDate] = useState(formatDate(defaultEnd));
  const [selectedContent, setSelectedContent] = useState<ContentTableItem | null>(null);
  const [compareItems, setCompareItems] = useState<ContentTableItem[] | null>(null);

  const { user, loading: userLoading } = useCurrentUser();
  const { settings, refresh: refreshSettings } = useUserSettings(user?.id ?? '');
  const { records, summaries, loading, refresh } = useIncomeData(user?.id ?? '', startDate, endDate);
  const { status, logs, sync } = useCollector();
  const { token } = useToken();

  // Full summaries (not filtered by date) for overview charts
  const [allSummaries, setAllSummaries] = useState<DailySummary[]>([]);
  const [allIncomeRecords, setAllIncomeRecords] = useState<IncomeRecord[]>([]);
  const monetizedContentIds = useMemo(() => new Set(allIncomeRecords.map(r => r.contentId)), [allIncomeRecords]);

  const allContentOptions = useMemo(() => {
    const map = new Map<string, { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }>();
    for (const r of allIncomeRecords) {
      if (!map.has(r.contentId)) {
        map.set(r.contentId, {
          contentId: r.contentId, contentToken: r.contentToken,
          contentType: r.contentType, title: r.title, publishDate: r.publishDate,
        });
      }
    }
    return Array.from(map.values());
  }, [allIncomeRecords]);
  const totalContentCount = monetizedContentIds.size;
  const refreshAllSummaries = useCallback(() => {
    if (!user) return;
    getAllDailySummaries(user.id).then(setAllSummaries);
    db.incomeRecords.where('userId').equals(user.id).toArray().then(setAllIncomeRecords);
  }, [user]);
  useEffect(() => { refreshAllSummaries(); }, [refreshAllSummaries]);

  // Derived: date range of all data
  const allDateRange = useMemo(() => {
    if (allSummaries.length === 0) return { start: '', end: '' };
    return { start: allSummaries[0].date, end: allSummaries[allSummaries.length - 1].date };
  }, [allSummaries]);

  // Sync state
  const [syncMsg, setSyncMsg] = useState('');
  const [setupDate, setSetupDate] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState('');

  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setStartDate(formatDate(dates[0].toDate()));
      setEndDate(formatDate(dates[1].toDate()));
    }
  };

  const hasSetup = !!settings?.collectStartDate;

  const handleSync = async (initDate?: string) => {
    setSyncMsg('');
    try {
      const result = await sync(initDate);
      if (!hasSetup) refreshSettings();
      setSyncMsg(result.synced === 0 ? '数据已是最新' : `同步完成，补全 ${result.synced} 天`);
      refresh(); refreshAllSummaries();
      if (initDate) setSetupOpen(false);
    } catch (err) {
      setSyncMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleFetchAllDaily = async () => {
    setSyncMsg('');
    try {
      // Step 1: Fetch all creations from API to get the full content list
      setSyncMsg('正在获取全部已发表内容列表...');
      const creationsResp = await new Promise<{ ok: boolean; items?: any[]; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchAllCreations' }, (resp) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(resp);
        });
      });

      // Build content map: start with creations API, supplement with income records
      const contentMap = new Map<string, { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }>();

      if (creationsResp.ok && creationsResp.items) {
        for (const item of creationsResp.items) {
          contentMap.set(item.contentId, {
            contentId: item.contentId,
            contentToken: item.contentToken,
            contentType: item.contentType,
            title: item.title,
            publishDate: item.publishDate,
          });
        }
      }

      // Also include content from income records (in case some are missing from creations API)
      const incomeAll = await db.incomeRecords.where('userId').equals(user!.id).toArray();
      for (const r of incomeAll) {
        if (!contentMap.has(r.contentId)) {
          contentMap.set(r.contentId, {
            contentId: r.contentId, contentToken: r.contentToken,
            contentType: r.contentType, title: r.title, publishDate: r.publishDate,
          });
        }
      }

      const items = Array.from(contentMap.values());
      if (items.length === 0) { setSyncMsg('没有找到内容数据'); return; }

      // Step 2: Fetch daily data for all content
      setSyncMsg(`找到 ${items.length} 篇内容，开始拉取每日详情...`);
      const response = await new Promise<{ ok: boolean; count?: number; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchContentDaily', items }, (resp) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(resp);
        });
      });
      if (response.ok) {
        setSyncMsg(`拉取完成，共 ${items.length} 篇内容，获取 ${response.count} 条每日详情数据`);
      } else {
        setSyncMsg(`拉取失败: ${response.error}`);
      }
    } catch (err) {
      setSyncMsg(`拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleExport = async () => {
    const json = await exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhixi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromJSON(text);
      setImportMsg(`导入成功，共 ${result.imported} 条记录`);
      refresh(); refreshAllSummaries();
    } catch (err) {
      setImportMsg(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stats = useMemo(() => {
    let totalIncome = 0, totalRead = 0, totalInteraction = 0;
    for (const s of allSummaries) {
      totalIncome += s.totalIncome;
      totalRead += s.totalRead;
      totalInteraction += s.totalInteraction;
    }
    const rpm = totalRead > 0 ? (totalIncome / 100 / totalRead) * 1000 : 0;

    // Yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = formatDate(yesterday);
    const ySummary = allSummaries.find(s => s.date === yStr);
    const yesterdayIncome = ySummary ? ySummary.totalIncome / 100 : 0;
    const yesterdayRead = ySummary ? ySummary.totalRead : 0;
    const yesterdayContentCount = ySummary ? ySummary.contentCount : 0;

    // This month — need allIncomeRecords for unique content count
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let monthIncome = 0, monthRead = 0;
    for (const s of allSummaries) {
      if (s.date.startsWith(monthPrefix)) {
        monthIncome += s.totalIncome;
        monthRead += s.totalRead;
      }
    }
    const monthContentIds = new Set<string>();
    for (const r of allIncomeRecords) {
      if (r.recordDate.startsWith(monthPrefix)) {
        monthContentIds.add(r.contentId);
      }
    }

      const monthDaysElapsed = now.getDate();
      const monthDaysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return {
      totalIncome: totalIncome / 100, totalRead, totalInteraction, rpm,
      days: allSummaries.length,
      yesterdayIncome, yesterdayRead, yesterdayContentCount,
      monthIncome: monthIncome / 100, monthRead, monthContentCount: monthContentIds.size,
      monthDaysElapsed, monthDaysTotal,
    };
  }, [allSummaries, allIncomeRecords]);

  if (userLoading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" tip="正在连接知乎..." />
      </Flex>
    );
  }

  if (compareItems) {
    return (
      <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: 24, background: 'transparent' }}>
        <Content>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setCompareItems(null)} style={{ marginBottom: 16 }}>
            返回
          </Button>
          <ContentComparePage
            initialItems={compareItems}
            allContentOptions={allContentOptions}
            onBack={() => setCompareItems(null)}
          />
        </Content>
      </Layout>
    );
  }

  if (selectedContent) {
    return (
      <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: 24, background: 'transparent' }}>
        <Content>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setSelectedContent(null)} style={{ marginBottom: 16 }}>
            返回总览
          </Button>
          <ContentDetailPage
            contentId={selectedContent.contentId}
            contentToken={selectedContent.contentToken}
            contentType={selectedContent.contentType}
            title={selectedContent.title}
            publishDate={selectedContent.publishDate}
            onBack={() => setSelectedContent(null)}
            onCompare={(item) => {
              setSelectedContent(null);
              setCompareItems([item as any]);
            }}
          />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: 24, background: 'transparent' }}>
      <Content>
        {/* Header */}
        <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700 }}>知析</h1>
            {user && <div style={{ fontSize: 13, color: token.colorTextSecondary, marginTop: 4 }}>{user.name}</div>}
          </div>
          <Space>
            {/* Sync button */}
            {hasSetup ? (
              <Button
                type="primary"
                icon={<SyncOutlined spin={status.isCollecting} />}
                onClick={() => handleSync()}
                loading={status.isCollecting}
                size="small"
              >
                {status.isCollecting ? `${status.progress}/${status.total}` : '同步'}
              </Button>
            ) : (
              <Button type="primary" icon={<DatabaseOutlined />} onClick={() => setSetupOpen(true)} size="small">
                首次设置
              </Button>
            )}

            {/* Data management dropdown */}
            <Dropdown
              menu={{
                items: [
                  { key: 'fetchAll', icon: <CloudDownloadOutlined />, label: '拉取全部内容详情', onClick: handleFetchAllDaily, disabled: status.isCollecting },
                  { type: 'divider' },
                  { key: 'export', icon: <DownloadOutlined />, label: '导出数据', onClick: handleExport },
                  { key: 'import', icon: <UploadOutlined />, label: '导入数据', onClick: () => fileInputRef.current?.click() },
                  { type: 'divider' },
                  {
                    key: 'autoSync',
                    label: (
                      <Flex justify="space-between" align="center" style={{ minWidth: 160 }}>
                        <span>自动同步（每6小时）</span>
                        <span style={{ color: settings?.autoSyncEnabled !== false ? '#52c41a' : '#999', fontSize: 12 }}>
                          {settings?.autoSyncEnabled !== false ? '已开启' : '已关闭'}
                        </span>
                      </Flex>
                    ),
                    onClick: async () => {
                      if (!user || !settings) return;
                      const newEnabled = settings.autoSyncEnabled === false;
                      await import('@/db/income-store').then(m =>
                        m.saveUserSettings({ ...settings, autoSyncEnabled: newEnabled })
                      );
                      refreshSettings();
                    },
                  },
                  { type: 'divider' },
                  {
                    key: 'info', label: (
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {hasSetup ? `采集范围：${settings!.collectStartDate} 起` : '未设置采集'}
                      </span>
                    ), disabled: true,
                  },
                ],
              }}
              trigger={['click']}
            >
              <Button icon={<SettingOutlined />} size="small" />
            </Dropdown>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </Space>
        </Flex>

        {/* Progress + Logs panel */}
        {(status.isCollecting || logs.length > 0) && (
          <Card
            size="small"
            style={{ marginBottom: 16 }}
            title={
              status.isCollecting ? (
                <Flex align="center" gap={8}>
                  <SyncOutlined spin style={{ color: token.colorPrimary }} />
                  <span style={{ fontSize: 13 }}>{status.task ?? '采集中'}</span>
                  {status.currentDate && <span style={{ fontSize: 12, color: '#999' }}>— {status.currentDate}</span>}
                  <span style={{ fontSize: 12, color: '#999' }}>{status.progress}/{status.total}</span>
                </Flex>
              ) : (
                <span style={{ fontSize: 13 }}>采集日志</span>
              )
            }
            extra={!status.isCollecting && <Button size="small" type="text" onClick={() => { /* logs cleared on next collect */ }}>收起</Button>}
          >
            {status.isCollecting && (
              <Progress
                percent={status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0}
                size="small"
                style={{ marginBottom: 8 }}
              />
            )}
            <div style={{
              maxHeight: 150, overflow: 'auto', fontSize: 12, fontFamily: 'monospace',
              background: '#fafafa', borderRadius: 4, padding: '6px 10px',
              lineHeight: 1.8, color: '#555',
            }}>
              {logs.length === 0 ? (
                <span style={{ color: '#999' }}>暂无日志</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{
                    color: log.includes('失败') || log.includes('错误') ? '#d32f2f'
                      : log.includes('完成') ? '#34a853'
                      : log.includes('跳过') ? '#999'
                      : '#555',
                  }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Messages */}
        {syncMsg && (
          <Alert message={syncMsg} type={syncMsg.includes('失败') ? 'error' : 'success'} showIcon closable
            style={{ marginBottom: 16 }} onClose={() => setSyncMsg('')} />
        )}
        {importMsg && (
          <Alert message={importMsg} type={importMsg.includes('失败') ? 'error' : 'success'} showIcon closable
            style={{ marginBottom: 16 }} onClose={() => setImportMsg('')} />
        )}

        {/* First-time setup modal */}
        <Modal
          title="首次设置"
          open={setupOpen}
          onCancel={() => setSetupOpen(false)}
          onOk={() => handleSync(setupDate)}
          okText="开始同步"
          okButtonProps={{ disabled: !setupDate || status.isCollecting, loading: status.isCollecting }}
        >
          <div style={{ marginBottom: 12, color: '#666' }}>
            请选择你开通致知计划的大致日期，插件将从该日期开始采集收益数据。
          </div>
          <DatePicker
            onChange={(date) => setSetupDate(date ? date.format('YYYY-MM-DD') : '')}
            placeholder="选择开始日期"
            style={{ width: '100%' }}
          />
        </Modal>

        {loading ? (
          <Flex justify="center" style={{ padding: 80 }}>
            <Spin size="large" tip="加载中..." />
          </Flex>
        ) : allSummaries.length === 0 ? (
          <Empty description="暂无数据，请先点击右上角同步按钮采集收益数据" style={{ padding: 80 }} />
        ) : (
          <>
            {/* Summary Stats */}
            <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Card size="small" title="昨日" styles={{ header: { minHeight: 0, padding: '8px 12px', fontSize: 13 }, body: { padding: '8px 12px' } }}>
                  <Flex justify="space-between">
                    <Statistic title="收益" value={stats.yesterdayIncome} precision={2} prefix="¥" valueStyle={{ color: '#ea4335', fontWeight: 700, fontSize: 20 }} />
                    <Statistic title="阅读" value={stats.yesterdayRead} valueStyle={{ fontSize: 20 }} />
                    <Statistic title="内容" value={stats.yesterdayContentCount} suffix="篇" valueStyle={{ fontSize: 20 }} />
                  </Flex>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title="本月" styles={{ header: { minHeight: 0, padding: '8px 12px', fontSize: 13 }, body: { padding: '8px 12px' } }}>
                  <Flex justify="space-between">
                    <Statistic title="收益" value={stats.monthIncome} precision={2} prefix="¥" valueStyle={{ color: '#f9a825', fontWeight: 700, fontSize: 20 }} />
                    <Statistic title="阅读" value={stats.monthRead} valueStyle={{ fontSize: 20 }} />
                    <Statistic title="内容" value={stats.monthContentCount} suffix="篇" valueStyle={{ fontSize: 20 }} />
                  </Flex>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title="总览" styles={{ header: { minHeight: 0, padding: '8px 12px', fontSize: 13 }, body: { padding: '8px 12px' } }}>
                  <Flex justify="space-between">
                    <Statistic title="收益" value={stats.totalIncome} precision={2} prefix="¥" valueStyle={{ color: token.colorPrimary, fontWeight: 700, fontSize: 20 }} />
                    <Statistic title="RPM" value={stats.rpm} precision={2} prefix="¥" valueStyle={{ fontSize: 20 }} />
                    <Statistic title="内容" value={totalContentCount} suffix="篇" valueStyle={{ fontSize: 20 }} />
                  </Flex>
                </Card>
              </Col>
            </Row>

            {/* Tabs */}
            <Tabs
              defaultActiveKey="overview"
              type="card"
              items={[
                {
                  key: 'overview',
                  label: '总览',
                  children: allSummaries.length === 0 ? (
                    <Empty description="暂无数据" />
                  ) : (
                    <Flex vertical gap={24}>
                      {user && (
                        <IncomeGoalPanel
                          userId={user.id}
                          monthIncome={stats.monthIncome}
                          monthDaysElapsed={stats.monthDaysElapsed}
                          monthDaysTotal={stats.monthDaysTotal}
                        />
                      )}
                      <DailyTrendChart summaries={allSummaries} startDate={allDateRange.start} endDate={allDateRange.end} />
                      <ContentTypeComparisonPanel records={allIncomeRecords} />
                      <Row gutter={16}>
                        <Col span={16}>
                          <RPMForecastPanel summaries={allSummaries} startDate={allDateRange.start} endDate={allDateRange.end} />
                        </Col>
                        <Col span={8}>
                          <WeeklySeasonalityChart summaries={allSummaries} />
                        </Col>
                      </Row>
                      <PublishTimeAnalysis records={allIncomeRecords} />
                      <AnomalyDetectionPanel summaries={allSummaries} startDate={allDateRange.start} endDate={allDateRange.end} />
                      <MultiDimensionRanking
                        records={allIncomeRecords}
                        onContentClick={(item) => setSelectedContent({
                          ...item,
                          currentIncome: 0,
                          currentRead: 0,
                          currentInteraction: 0,
                        })}
                      />
                    </Flex>
                  ),
                },
                {
                  key: 'ml',
                  label: '智能分析',
                  children: <MLPredictionPanel records={records} />,
                },
                {
                  key: 'unmonetized',
                  label: '未产生收益',
                  children: <UnmonetizedContentPanel monetizedContentIds={monetizedContentIds} />,
                },
                {
                  key: 'content',
                  label: `内容明细 (${totalContentCount})`,
                  children: (
                    <Flex vertical gap={12}>
                      <Flex justify="flex-end">
                        <RangePicker
                          value={[dayjs(startDate), dayjs(endDate)]}
                          onChange={handleRangeChange}
                          presets={Object.entries(quickRanges).map(([label, value]) => ({ label, value }))}
                          allowClear={false}
                          size="small"
                        />
                      </Flex>
                      <ContentTable
                        records={records}
                        onContentClick={setSelectedContent}
                        onCompare={(items) => setCompareItems(items)}
                      />
                    </Flex>
                  ),
                },
              ]}
            />
          </>
        )}
      </Content>
    </Layout>
  );
}
