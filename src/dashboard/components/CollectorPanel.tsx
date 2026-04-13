import React, { useState } from 'react';
import { Card, Button, DatePicker, Space, Progress, Alert, Flex } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useCollector } from '@/hooks/use-collector';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useUserSettings } from '@/hooks/use-user-settings';
import { themeColors } from '../theme';

interface Props {
  onCollected: () => void;
}

export function CollectorPanel({ onCollected }: Props) {
  const { user } = useCurrentUser();
  const { settings, refresh: refreshSettings } = useUserSettings(user?.id ?? '');
  const { status, sync } = useCollector();
  const [startDate, setStartDate] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const hasSetup = !!settings?.collectStartDate;

  const handleSync = async () => {
    setResultMsg('');
    try {
      const result = await sync(hasSetup ? undefined : startDate || undefined);
      if (!hasSetup) refreshSettings();
      if (result.synced === 0) {
        setResultMsg('数据已是最新');
      } else {
        setResultMsg(`同步完成，补全 ${result.synced} 天，共 ${result.count} 条记录`);
      }
      onCollected();
    } catch (err) {
      setResultMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <Card title="数据采集" size="small">
      {hasSetup ? (
        <Flex justify="space-between" align="center">
          <span style={{ color: '#666' }}>数据范围：{settings!.collectStartDate} 起</span>
          <Button type="primary" icon={<SyncOutlined />} onClick={handleSync} loading={status.isCollecting}>
            {status.isCollecting ? '同步中...' : '同步数据'}
          </Button>
        </Flex>
      ) : (
        <div>
          <div style={{ color: '#666', marginBottom: 8 }}>请设置致知计划开通日期，插件将从该日期开始采集</div>
          <Space>
            <DatePicker
              onChange={(date) => setStartDate(date ? date.format('YYYY-MM-DD') : '')}
              placeholder="选择开始日期"
            />
            <Button
              type="primary"
              onClick={handleSync}
              disabled={status.isCollecting || !startDate}
              loading={status.isCollecting}
            >
              {status.isCollecting ? '同步中...' : '开始同步'}
            </Button>
          </Space>
        </div>
      )}

      {status.isCollecting && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 12, color: themeColors.warmBlue }}>
            {status.currentDate} ({status.progress}/{status.total})
          </span>
          <Progress
            percent={status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0}
            size="small"
            showInfo={false}
          />
        </div>
      )}

      {resultMsg && (
        <Alert
          message={resultMsg}
          type={resultMsg.includes('失败') ? 'error' : 'success'}
          showIcon
          closable
          style={{ marginTop: 8 }}
          onClose={() => setResultMsg('')}
        />
      )}
    </Card>
  );
}
