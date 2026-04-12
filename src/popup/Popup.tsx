import React, { useState, useEffect } from 'react';
import { Button, Card, Progress, Spin, Flex, Typography } from 'antd';
import { SyncOutlined, ArrowRightOutlined, RocketOutlined } from '@ant-design/icons';
import { formatDate, getDateRange } from '@/shared/date-utils';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCollector } from '@/hooks/use-collector';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAccountManager } from '@/hooks/use-account-manager';
import { useUserSettings } from '@/hooks/use-user-settings';
import { TodaySummary } from './components/TodaySummary';
import { WeekSparkline } from './components/WeekSparkline';

const { Text } = Typography;

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

export function Popup() {
  const yesterday = getYesterday();
  const { start: weekStart } = getDateRange(7);
  const startStr = formatDate(weekStart);

  const accountManager = useAccountManager();
  const { user, loading: userLoading } = useCurrentUser(accountManager.activeAccountId ?? undefined);

  // Auto-add current logged-in user to saved accounts
  const { addCurrentAccount } = accountManager;
  useEffect(() => {
    if (user && !accountManager.activeAccountId) {
      addCurrentAccount(user);
    }
  }, [user, accountManager.activeAccountId, addCurrentAccount]);

  const effectiveUserId = accountManager.activeAccountId ?? user?.id ?? '';

  const { settings, loading: settingsLoading } = useUserSettings(effectiveUserId);
  const { summaries, loading, refresh } = useIncomeData(effectiveUserId, startStr, yesterday);
  const { status, sync } = useCollector();

  const yesterdaySummary = summaries.find((s) => s.date === yesterday);

  const [resultMsg, setResultMsg] = useState('');

  const prevCollecting = React.useRef(status.isCollecting);
  useEffect(() => {
    if (prevCollecting.current && !status.isCollecting && !status.error) refresh();
    prevCollecting.current = status.isCollecting;
  }, [status.isCollecting, status.error, refresh]);

  const handleSync = async () => {
    setResultMsg('');
    try {
      const result = await sync();
      setResultMsg(
        result.synced === 0 ? '数据已是最新' : `同步完成，补全 ${result.synced} 天，共 ${result.count} 条记录`,
      );
      refresh();
    } catch (err) {
      setResultMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const openDashboard = (withSetup = false) => {
    chrome.runtime.sendMessage({ action: 'openDashboard', withSetup });
    window.close();
  };

  if (userLoading || settingsLoading) {
    return (
      <Flex justify="center" align="center" style={{ width: 340, padding: 40 }}>
        <Spin tip="正在连接知乎..." />
      </Flex>
    );
  }

  const hasSetup = !!settings?.collectStartDate;

  return (
    <div style={{ width: 340, padding: 12 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>知析</div>
          {user && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {user.name}
            </Text>
          )}
        </div>
        {hasSetup && (
          <Button size="small" onClick={() => openDashboard()} icon={<ArrowRightOutlined />}>
            详细分析
          </Button>
        )}
      </Flex>

      {hasSetup ? (
        <>
          <TodaySummary summary={yesterdaySummary} loading={loading} />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              近 7 天收益趋势
            </Text>
            <WeekSparkline summaries={summaries} />
          </div>

          <Card size="small" style={{ marginTop: 10 }}>
            <Flex justify="space-between" align="center">
              <Text type="secondary" style={{ fontSize: 12 }}>
                数据范围：{settings!.collectStartDate} 起
              </Text>
              <Button
                type="primary"
                size="small"
                icon={<SyncOutlined />}
                onClick={handleSync}
                loading={status.isCollecting}
              >
                {status.isCollecting ? '同步中' : '同步数据'}
              </Button>
            </Flex>

            {status.isCollecting && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {status.currentDate} ({status.progress}/{status.total})
                </Text>
                <Progress
                  percent={status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0}
                  size="small"
                  showInfo={false}
                />
              </div>
            )}

            {resultMsg && (
              <div style={{ marginTop: 6, fontSize: 11, color: resultMsg.includes('失败') ? '#d32f2f' : '#34a853' }}>
                {resultMsg}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card size="small" style={{ marginTop: 4 }}>
          <Flex vertical align="center" gap={8} style={{ padding: '12px 4px' }}>
            <RocketOutlined style={{ fontSize: 28, color: '#5b7a9d' }} />
            <Text strong style={{ fontSize: 13 }}>
              还没有开始采集数据
            </Text>
            <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
              为了更好的初次体验，请前往首页完成设置
              <br />
              我们会引导你选择致知计划开通日期并自动同步历史数据
            </Text>
            <Button
              type="primary"
              size="middle"
              icon={<ArrowRightOutlined />}
              onClick={() => openDashboard(true)}
              style={{ marginTop: 6 }}
              block
            >
              前往首页开始设置
            </Button>
          </Flex>
        </Card>
      )}

      {status.error && !resultMsg && (
        <Text type="danger" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 8 }}>
          {status.error}
        </Text>
      )}
    </div>
  );
}
