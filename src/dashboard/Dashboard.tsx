import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Layout,
  Tabs,
  Spin,
  Empty,
  Row,
  Col,
  Statistic,
  Card,
  Flex,
  DatePicker,
  Space,
  Button,
  theme,
  Dropdown,
  Progress,
  Alert,
  Modal,
  Drawer,
  Segmented,
} from 'antd';
import {
  ArrowLeftOutlined,
  SyncOutlined,
  DownloadOutlined,
  UploadOutlined,
  SettingOutlined,
  DatabaseOutlined,
  TrophyOutlined,
  ReadOutlined,
  DollarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAccountManager } from '@/hooks/use-account-manager';
import { AccountSwitcher } from './components/AccountSwitcher';
import { AccountManager } from './components/AccountManager';
import { getAllDailySummaries } from '@/db/income-store';
import { db } from '@/db/database';
import type { DailySummary, IncomeRecord } from '@/shared/types';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useCollector } from '@/hooks/use-collector';
import { ContentTable, type ContentTableItem } from './components/ContentTable';
import { ContentDetailPage } from './components/ContentDetailPage';
import { ContentComparePage } from './components/ContentComparePage';
import { generateExcelReport } from './components/ExcelExportButton';
import { ExportHtmlButton } from './components/ExportHtmlButton';
import { MilestonesPage } from './components/MilestonesPage';
import { ShareCardButton } from './components/ShareCardButton';
import { usePanelLayout } from '@/hooks/use-panel-layout';
import { getPanelMeta, type DashboardContext } from './panel-registry';
import { LayoutCustomizer } from './components/LayoutCustomizer';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { themeColors } from './theme';
import { NewFeatureBanner } from './tour/NewFeatureBanner';
import { useTourManagement } from './hooks/useTourManagement';
import { useSyncOrchestration } from './hooks/useSyncOrchestration';
import { CurrencyProvider, useCurrency } from './contexts/CurrencyContext';

const { Content } = Layout;
const { RangePicker } = DatePicker;
const { useToken } = theme;

const quickRanges: Record<string, [Dayjs, Dayjs]> = {
  昨日: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')],
  最近7天: [dayjs().subtract(7, 'day'), dayjs()],
  最近30天: [dayjs().subtract(30, 'day'), dayjs()],
  最近90天: [dayjs().subtract(90, 'day'), dayjs()],
};

const cardHeaderStyles = {
  header: {
    minHeight: 0,
    padding: '10px 16px',
    fontSize: 12,
    color: themeColors.muted,
    fontWeight: 500,
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  body: { padding: '12px 16px' },
};

export function Dashboard() {
  return (
    <CurrencyProvider>
      <DashboardInner />
    </CurrencyProvider>
  );
}

function DashboardInner() {
  const currency = useCurrency();
  const { start: defaultStart, end: defaultEnd } = getDateRange(30);
  const [startDate, setStartDate] = useState(formatDate(defaultStart));
  const [endDate, setEndDate] = useState(formatDate(defaultEnd));
  const [selectedContent, setSelectedContent] = useState<ContentTableItem | null>(null);
  const [compareItems, setCompareItems] = useState<ContentTableItem[] | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState('overview');

  const accountManager = useAccountManager();
  const { user, loading: userLoading } = useCurrentUser(accountManager.activeAccountId ?? undefined);

  // Auto-add current logged-in user to saved accounts
  const { addCurrentAccount } = accountManager;
  useEffect(() => {
    if (user && !accountManager.activeAccountId) {
      addCurrentAccount(user);
    }
  }, [user, accountManager.activeAccountId, addCurrentAccount]);

  // Determine effective userId: prefer active account, fallback to fetched user
  const effectiveUserId = accountManager.activeAccountId ?? user?.id ?? '';

  const { settings, refresh: refreshSettings } = useUserSettings(effectiveUserId);
  const { records, loading, refresh } = useIncomeData(effectiveUserId, startDate, endDate);
  const collector = useCollector();
  const { status, logs } = collector;
  const { token } = useToken();
  const { layout, updateLayout, resetLayout } = usePanelLayout(effectiveUserId);

  // Full summaries (not filtered by date)
  const [allSummaries, setAllSummaries] = useState<DailySummary[]>([]);
  const [allIncomeRecords, setAllIncomeRecords] = useState<IncomeRecord[]>([]);
  const monetizedContentIds = useMemo(() => new Set(allIncomeRecords.map((r) => r.contentId)), [allIncomeRecords]);
  const monetizedContentTokens = useMemo(
    () => new Set(allIncomeRecords.map((r) => r.contentToken)),
    [allIncomeRecords],
  );
  const allContentOptions = useMemo(() => {
    const map = new Map<
      string,
      { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }
    >();
    for (const r of allIncomeRecords) {
      if (!map.has(r.contentId))
        map.set(r.contentId, {
          contentId: r.contentId,
          contentToken: r.contentToken,
          contentType: r.contentType,
          title: r.title,
          publishDate: r.publishDate,
        });
    }
    return Array.from(map.values());
  }, [allIncomeRecords]);
  const realContentCount = monetizedContentIds.size;

  const refreshAllSummaries = useCallback(() => {
    if (!effectiveUserId) return;
    getAllDailySummaries(effectiveUserId).then(setAllSummaries);
    db.incomeRecords.where('userId').equals(effectiveUserId).toArray().then(setAllIncomeRecords);
  }, [effectiveUserId]);
  useEffect(() => {
    refreshAllSummaries();
  }, [refreshAllSummaries]);

  const hasSetup = !!settings?.collectStartDate;

  // Tour management
  // ML demo tour state
  const [mlDemoStep, setMlDemoStep] = useState<number | undefined>(undefined);
  const [mlAnimating, setMlAnimating] = useState(false);

  // Disable driver.js next button while ML neural network animation plays
  useEffect(() => {
    if (!mlAnimating) {
      const nextBtn = document.querySelector('.driver-popover-next-btn');
      if (nextBtn) nextBtn.removeAttribute('disabled');
    }
  }, [mlAnimating]);

  const demoContentItem: ContentTableItem = useMemo(
    () => ({
      contentId: 'demo-1',
      contentToken: 'demo-token-1',
      contentType: 'article',
      title: '如何高效学习编程：从零到一的实践指南',
      publishDate: '2025-01-15',
      currentIncome: 0,
      currentRead: 0,
      currentInteraction: 0,
    }),
    [],
  );
  const tourCallbacks = useMemo(
    () => ({
      switchTab: setActiveTabKey,
      onAction: (action: string) => {
        if (action === 'show-content-detail') setSelectedContent(demoContentItem);
        if (action === 'hide-content-detail') setSelectedContent(null);
        // ML demo steps
        const mlMatch = action.match(/^ml-demo-(\d)$/);
        if (mlMatch) setMlDemoStep(Number(mlMatch[1]));
        if (action === 'ml-demo-reset') {
          setMlDemoStep(undefined);
          setMlAnimating(false);
        }
      },
    }),
    [setActiveTabKey, demoContentItem],
  );
  const tour = useTourManagement({ userId: user?.id, allSummaries, allIncomeRecords, tourCallbacks });

  // Sync orchestration
  const sync = useSyncOrchestration({
    collector,
    userId: user?.id,
    hasSetup,
    refreshSettings,
    refresh,
    refreshAllSummaries,
  });

  // First visit: auto-open setup modal
  const firstVisitHandledRef = useRef(false);
  useEffect(() => {
    if (tour.isFirstVisit && !hasSetup && !firstVisitHandledRef.current) {
      firstVisitHandledRef.current = true;
      sync.setSetupOpen(true);
    }
  }, [tour.isFirstVisit, hasSetup, sync]);

  const { useDemo, effectiveSummaries, effectiveRecords, effectiveDateRange } = tour;

  const totalContentCount = useDemo ? new Set(effectiveRecords.map((r) => r.contentId)).size : realContentCount;

  const stats = useMemo(() => {
    let totalIncome = 0,
      totalRead = 0,
      totalInteraction = 0;
    for (const s of effectiveSummaries) {
      totalIncome += s.totalIncome;
      totalRead += s.totalRead;
      totalInteraction += s.totalInteraction;
    }
    const rpm = totalRead > 0 ? (currency.convert(totalIncome) / totalRead) * 1000 : 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = formatDate(yesterday);
    const ySummary = effectiveSummaries.find((s) => s.date === yStr);
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let monthIncome = 0,
      monthRead = 0;
    for (const s of effectiveSummaries) {
      if (s.date.startsWith(monthPrefix)) {
        monthIncome += s.totalIncome;
        monthRead += s.totalRead;
      }
    }
    const monthContentIds = new Set<string>();
    for (const r of effectiveRecords) {
      if (r.recordDate.startsWith(monthPrefix)) monthContentIds.add(r.contentId);
    }
    return {
      totalIncome: currency.convert(totalIncome),
      totalRead,
      totalInteraction,
      rpm,
      days: effectiveSummaries.length,
      yesterdayIncome: ySummary ? currency.convert(ySummary.totalIncome) : 0,
      yesterdayRead: ySummary?.totalRead ?? 0,
      yesterdayContentCount: ySummary?.contentCount ?? 0,
      monthIncome: currency.convert(monthIncome),
      monthRead,
      monthContentCount: monthContentIds.size,
      monthDaysElapsed: now.getDate(),
      monthDaysTotal: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    };
  }, [effectiveSummaries, effectiveRecords, currency]);

  const dashboardContext: DashboardContext | null = useMemo(() => {
    if (!effectiveUserId) return null;
    return {
      userId: effectiveUserId,
      demoMode: useDemo,
      mlDemoStep,
      onMlDemoAnimating: setMlAnimating,
      allSummaries: effectiveSummaries,
      allDateRange: effectiveDateRange,
      allIncomeRecords: effectiveRecords,
      records: useDemo ? effectiveRecords : records,
      monetizedContentIds,
      monetizedContentTokens,
      monthIncome: stats.monthIncome,
      monthDaysElapsed: stats.monthDaysElapsed,
      monthDaysTotal: stats.monthDaysTotal,
      onContentClick: (item) => setSelectedContent(item),
    };
  }, [
    effectiveUserId,
    effectiveSummaries,
    effectiveDateRange,
    effectiveRecords,
    useDemo,
    mlDemoStep,
    records,
    monetizedContentIds,
    monetizedContentTokens,
    stats,
  ]);

  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setStartDate(formatDate(dates[0].toDate()));
      setEndDate(formatDate(dates[1].toDate()));
    }
  };

  // Loading / sub-pages
  if (userLoading)
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" tip="正在连接知乎..." />
      </Flex>
    );
  if (compareItems)
    return (
      <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px', background: 'transparent' }}>
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
  if (selectedContent)
    return (
      <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px', background: 'transparent' }}>
        <Content>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setSelectedContent(null)} style={{ marginBottom: 16 }}>
            返回总览
          </Button>
          <ContentDetailPage
            {...selectedContent}
            onBack={() => setSelectedContent(null)}
            onCompare={(item) => {
              setSelectedContent(null);
              setCompareItems([item]);
            }}
            demoMode={useDemo}
          />
        </Content>
      </Layout>
    );

  // Dropdown menu items
  const settingsMenuItems = [
    hasSetup
      ? {
          key: 'syncAll',
          icon: <SyncOutlined spin={status.isCollecting} />,
          label: status.isCollecting ? `同步中 ${status.progress}/${status.total}` : '全部同步',
          onClick: sync.handleSyncAll,
          disabled: status.isCollecting,
        }
      : { key: 'setup', icon: <DatabaseOutlined />, label: '首次设置', onClick: () => sync.setSetupOpen(true) },
    { type: 'divider' as const },
    {
      key: 'syncIncome',
      icon: <DollarOutlined />,
      label: '收益同步',
      onClick: () => sync.handleSyncIncome(),
      disabled: status.isCollecting || !hasSetup,
    },
    {
      key: 'syncAggr',
      icon: <BarChartOutlined />,
      label: '每日汇总',
      onClick: sync.handleSyncRealtimeAggr,
      disabled: status.isCollecting || !hasSetup,
    },
    {
      key: 'fetchContentDaily',
      icon: <FileTextOutlined />,
      label: '内容详情',
      onClick: sync.handleFetchContentDaily,
      disabled: status.isCollecting || !hasSetup,
    },
    {
      key: 'fetchToday',
      icon: <ThunderboltOutlined />,
      label: '今日数据',
      onClick: sync.handleFetchTodayData,
      disabled: status.isCollecting || !hasSetup,
    },
    { type: 'divider' as const },
    { key: 'export', icon: <DownloadOutlined />, label: '导出数据', onClick: sync.handleExport },
    {
      key: 'exportExcel',
      icon: <DownloadOutlined />,
      label: '导出 Excel 报告',
      onClick: () => {
        if (user && allSummaries.length > 0)
          generateExcelReport({
            userName: useDemo ? '知析用户' : user.name,
            allSummaries,
            allRecords: allIncomeRecords,
          });
      },
    },
    { key: 'import', icon: <UploadOutlined />, label: '导入数据', onClick: () => sync.fileInputRef.current?.click() },
    { type: 'divider' as const },
    { key: 'layout', icon: <SettingOutlined />, label: '自定义布局', onClick: () => setCustomizerOpen(true) },
    { key: 'milestones', icon: <TrophyOutlined />, label: '成就记录', onClick: () => setMilestonesOpen(true) },
    { key: 'tour', icon: <ReadOutlined />, label: '功能介绍', onClick: tour.handleStartTour },
    { type: 'divider' as const },
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
        await import('@/db/income-store').then((m) => m.saveUserSettings({ ...settings, autoSyncEnabled: newEnabled }));
        refreshSettings();
      },
    },
    { type: 'divider' as const },
    {
      key: 'info',
      label: (
        <span style={{ fontSize: 12, color: '#999' }}>
          {hasSetup ? `采集范围：${settings!.collectStartDate} 起` : '未设置采集'}
        </span>
      ),
      disabled: true,
    },
  ];

  return (
    <Layout style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px', background: 'transparent' }}>
      <Content>
        {/* Header */}
        <Flex justify="space-between" align="center" style={{ marginBottom: 28 }}>
          <div>
            <h1
              style={{
                fontSize: 24,
                margin: 0,
                fontWeight: 700,
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.04em',
                color: themeColors.ink,
              }}
            >
              知析
            </h1>
            {user && (
              <div style={{ fontSize: 12, color: themeColors.muted, marginTop: 4, letterSpacing: '0.02em' }}>
                {useDemo ? '知析用户' : user.name} 的创作数据
              </div>
            )}
          </div>
          <Space>
            {accountManager.accounts.length > 0 && (
              <AccountSwitcher
                accounts={
                  useDemo
                    ? accountManager.accounts.map((a) => ({ ...a, name: '知析用户', avatarUrl: '' }))
                    : accountManager.accounts
                }
                activeAccountId={accountManager.activeAccountId}
                onSwitch={accountManager.switchAccount}
                onManage={() => setAccountManagerOpen(true)}
              />
            )}
            {(allSummaries.length > 0 || useDemo) && (
              <ShareCardButton allSummaries={effectiveSummaries} allRecords={effectiveRecords} />
            )}
            {(allSummaries.length > 0 || useDemo) && user && (
              <ExportHtmlButton
                userName={useDemo ? '知析用户' : user.name}
                allSummaries={effectiveSummaries}
                allRecords={effectiveRecords}
              />
            )}
            <Segmented
              size="small"
              options={[
                { label: '元', value: 'yuan' },
                { label: '盐粒', value: 'salt' },
              ]}
              value={currency.unit}
              onChange={(v) => currency.setUnit(v as 'salt' | 'yuan')}
            />
            <Dropdown menu={{ items: settingsMenuItems }} trigger={['click']}>
              <Button id="tour-settings-menu" icon={<SettingOutlined />} size="small">
                设置
              </Button>
            </Dropdown>
            <input
              ref={sync.fileInputRef}
              type="file"
              accept=".json"
              onChange={sync.handleImport}
              style={{ display: 'none' }}
            />
          </Space>
        </Flex>

        {/* Progress + Logs */}
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
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {status.progress}/{status.total}
                  </span>
                </Flex>
              ) : (
                <span style={{ fontSize: 13 }}>采集日志</span>
              )
            }
          >
            {status.isCollecting && (
              <Progress
                percent={status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0}
                size="small"
                style={{ marginBottom: 8 }}
              />
            )}
            <div
              style={{
                maxHeight: 150,
                overflow: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                background: '#fafafa',
                borderRadius: 4,
                padding: '6px 10px',
                lineHeight: 1.8,
                color: '#555',
              }}
            >
              {logs.length === 0 ? (
                <span style={{ color: '#999' }}>暂无日志</span>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      color:
                        log.includes('失败') || log.includes('错误')
                          ? '#d32f2f'
                          : log.includes('完成')
                            ? '#34a853'
                            : log.includes('跳过')
                              ? '#999'
                              : '#555',
                    }}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Messages */}
        {sync.syncMsg && (
          <Alert
            message={sync.syncMsg}
            type={sync.syncMsg.includes('失败') ? 'error' : 'success'}
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => sync.setSyncMsg('')}
          />
        )}
        {sync.importMsg && (
          <Alert
            message={sync.importMsg}
            type={sync.importMsg.includes('失败') ? 'error' : 'success'}
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => sync.setImportMsg('')}
          />
        )}
        {tour.showNewFeatureBanner && (
          <NewFeatureBanner
            featureCount={tour.newFeatureCount}
            onViewFeatures={tour.handleViewNewFeatures}
            onDismiss={tour.handleDismissNewFeatures}
          />
        )}

        {/* Setup modal */}
        <Modal
          title="首次设置"
          open={sync.setupOpen}
          onCancel={() => sync.setSetupOpen(false)}
          onOk={() => {
            // Start sync in background, then launch tour while data loads
            sync.handleSyncIncome(sync.setupDate);
            sync.setSetupOpen(false);
            tour.startFirstTimeTour();
          }}
          okText="开始同步"
          okButtonProps={{ disabled: !sync.setupDate || status.isCollecting, loading: status.isCollecting }}
        >
          <div style={{ marginBottom: 12, color: '#666' }}>
            请选择你开通致知计划的大致日期，插件将从该日期开始采集收益数据。
          </div>
          <DatePicker
            onChange={(date) => sync.setSetupDate(date ? date.format('YYYY-MM-DD') : '')}
            placeholder="选择开始日期"
            style={{ width: '100%' }}
          />
        </Modal>

        {/* Main content */}
        {loading ? (
          <Flex justify="center" style={{ padding: 80 }}>
            <Spin size="large" tip="加载中..." />
          </Flex>
        ) : effectiveSummaries.length === 0 ? (
          <Empty description="暂无数据，请先点击右上角设置按钮同步收益数据" style={{ padding: 80 }} />
        ) : (
          <>
            {useDemo && (
              <Alert
                message="当前展示的是演示数据，帮助你了解各功能区域。同步真实数据后将自动替换。"
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}
            <Row id="tour-summary-cards" gutter={[16, 16]} style={{ marginBottom: 28 }}>
              <Col span={8}>
                <Card size="small" styles={cardHeaderStyles} title="昨日">
                  <Flex justify="space-between">
                    <Statistic
                      title="收益"
                      value={stats.yesterdayIncome}
                      precision={currency.precision}
                      prefix={currency.prefix}
                      suffix={currency.suffix}
                      valueStyle={{
                        color: themeColors.amber,
                        fontWeight: 700,
                        fontSize: 22,
                        fontFamily: '"Noto Serif SC", serif',
                      }}
                    />
                    <Statistic
                      title="阅读"
                      value={stats.yesterdayRead}
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                    <Statistic
                      title="内容"
                      value={stats.yesterdayContentCount}
                      suffix="篇"
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                  </Flex>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" styles={cardHeaderStyles} title="本月">
                  <Flex justify="space-between">
                    <Statistic
                      title="收益"
                      value={stats.monthIncome}
                      precision={currency.precision}
                      prefix={currency.prefix}
                      suffix={currency.suffix}
                      valueStyle={{
                        color: themeColors.amber,
                        fontWeight: 700,
                        fontSize: 22,
                        fontFamily: '"Noto Serif SC", serif',
                      }}
                    />
                    <Statistic
                      title="阅读"
                      value={stats.monthRead}
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                    <Statistic
                      title="内容"
                      value={stats.monthContentCount}
                      suffix="篇"
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                  </Flex>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" styles={cardHeaderStyles} title="总览">
                  <Flex justify="space-between">
                    <Statistic
                      title="收益"
                      value={stats.totalIncome}
                      precision={currency.precision}
                      prefix={currency.prefix}
                      suffix={currency.suffix}
                      valueStyle={{
                        color: themeColors.warmBlue,
                        fontWeight: 700,
                        fontSize: 22,
                        fontFamily: '"Noto Serif SC", serif',
                      }}
                    />
                    <Statistic
                      title="RPM"
                      value={stats.rpm}
                      precision={2}
                      prefix={currency.rpmPfx}
                      suffix={currency.rpmSfx}
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                    <Statistic
                      title="内容"
                      value={totalContentCount}
                      suffix="篇"
                      valueStyle={{ fontSize: 20, color: themeColors.ink }}
                    />
                  </Flex>
                </Card>
              </Col>
            </Row>
            <Tabs
              id="tour-tab-bar"
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              type="card"
              items={
                layout
                  ? [...layout.tabs]
                      .filter((t) => t.visible)
                      .sort((a, b) => a.order - b.order)
                      .map((tab) => {
                        if (tab.key === 'content')
                          return {
                            key: 'content',
                            label: `${tab.label} (${totalContentCount})`,
                            children: (
                              <Flex vertical gap={12}>
                                <div id="tour-content-actions">
                                  <Flex justify="flex-end">
                                    <RangePicker
                                      value={[dayjs(startDate), dayjs(endDate)]}
                                      onChange={handleRangeChange}
                                      presets={Object.entries(quickRanges).map(([label, value]) => ({ label, value }))}
                                      allowClear={false}
                                      size="small"
                                    />
                                  </Flex>
                                </div>
                                <div id="tour-content-table">
                                  <ContentTable
                                    records={useDemo ? effectiveRecords : records}
                                    onContentClick={setSelectedContent}
                                    onCompare={(items) => setCompareItems(items)}
                                  />
                                </div>
                              </Flex>
                            ),
                          };
                        const visiblePanels = [...tab.panels]
                          .filter((p) => p.visible)
                          .sort((a, b) => a.order - b.order);
                        return {
                          key: tab.key,
                          label: tab.label,
                          children:
                            effectiveSummaries.length === 0 && tab.key === 'overview' ? (
                              <Empty description="暂无数据" />
                            ) : dashboardContext ? (
                              <Flex vertical gap={24}>
                                {visiblePanels.map((panelConfig) => {
                                  const meta = getPanelMeta(panelConfig.key);
                                  if (!meta) return null;
                                  return (
                                    <PanelErrorBoundary key={panelConfig.key} panelName={meta.label}>
                                      <div id={`tour-${panelConfig.key}`}>{meta.render(dashboardContext)}</div>
                                    </PanelErrorBoundary>
                                  );
                                })}
                              </Flex>
                            ) : null,
                        };
                      })
                  : []
              }
            />
          </>
        )}
        <Drawer title="成就记录" open={milestonesOpen} onClose={() => setMilestonesOpen(false)} width={480}>
          <MilestonesPage allSummaries={allSummaries} allRecords={allIncomeRecords} />
        </Drawer>
        {layout && (
          <LayoutCustomizer
            open={customizerOpen}
            onClose={() => setCustomizerOpen(false)}
            tabs={layout.tabs}
            onUpdate={updateLayout}
            onReset={() => {
              resetLayout();
              setCustomizerOpen(false);
            }}
          />
        )}
        <AccountManager
          open={accountManagerOpen}
          accounts={accountManager.accounts}
          activeAccountId={accountManager.activeAccountId}
          onClose={() => setAccountManagerOpen(false)}
          onSwitch={accountManager.switchAccount}
          onRemove={accountManager.removeAccount}
        />
      </Content>
    </Layout>
  );
}
