import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Progress, Spin, Flex, Typography } from 'antd';
import { SyncOutlined, ArrowRightOutlined, RocketOutlined, SafetyOutlined } from '@ant-design/icons';
import { formatDate, getDateRange, parseDateString } from '@/shared/date-utils';
import { hasZhihuHostPermission, requestZhihuHostPermission } from '@/shared/host-permissions';
import { useIncomeData } from '@/hooks/use-income-data';
import { useCollector } from '@/hooks/use-collector';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAccountManager } from '@/hooks/use-account-manager';
import { useUserSettings } from '@/hooks/use-user-settings';
import { YesterdaySummary } from './components/YesterdaySummary';
import { WeekSparkline } from './components/WeekSparkline';

const { Text } = Typography;

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

/**
 * Firefox MV3 treats host_permissions as optional. This gate runs first and
 * prevents the real popup (and its data hooks) from mounting until the user
 * has granted access to zhihu.com. On Chrome the check resolves to true
 * immediately because host_permissions are granted at install time.
 */
export function Popup() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasZhihuHostPermission().then((result) => {
      if (!cancelled) setGranted(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGrant = useCallback(async () => {
    setError(null);
    const ok = await requestZhihuHostPermission();
    if (ok) {
      window.location.reload();
      return;
    }
    setGranted(false);
    setError('未授权访问 zhihu.com，无法同步数据');
  }, []);

  if (granted === null) {
    return (
      <Flex justify="center" align="center" style={{ width: 340, padding: 40 }}>
        <Spin tip="正在检查权限..." />
      </Flex>
    );
  }

  if (!granted) {
    return (
      <div style={{ width: 340, padding: 12 }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>知析</div>
        </Flex>
        <Card size="small">
          <Flex vertical align="center" gap={10} style={{ padding: '12px 4px' }}>
            <SafetyOutlined style={{ fontSize: 28, color: '#5b7a9d' }} />
            <Text strong style={{ fontSize: 13 }}>
              需要授权访问 zhihu.com
            </Text>
            <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
              知析需要读取你在 zhihu.com 上的创作者数据才能分析收益。
              <br />
              点击下方按钮，在弹窗中确认授权。
            </Text>
            <Button
              type="primary"
              size="middle"
              icon={<SafetyOutlined />}
              onClick={handleGrant}
              block
              style={{ marginTop: 6 }}
            >
              授权访问 zhihu.com
            </Button>
            {error && (
              <Text type="danger" style={{ fontSize: 11, textAlign: 'center' }}>
                {error}
              </Text>
            )}
          </Flex>
        </Card>
      </div>
    );
  }

  return <PopupInner />;
}

function PopupInner() {
  const yesterday = getYesterday();
  // Zhihu settles income with one day of lag, so the week range ends at
  // yesterday (not today); otherwise the last sparkline bar always renders
  // as zero.
  const { start: weekStart, end: weekEnd } = getDateRange(7, parseDateString(yesterday));
  const startStr = formatDate(weekStart);
  const endStr = formatDate(weekEnd);

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
  const { summaries, loading, refresh } = useIncomeData(effectiveUserId, startStr, endStr);
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
          <YesterdaySummary summary={yesterdaySummary} loading={loading} />
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
