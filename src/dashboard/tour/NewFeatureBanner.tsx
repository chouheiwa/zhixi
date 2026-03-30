import React from 'react';
import { Alert, Button, Space } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import { themeColors } from '../theme';

interface Props {
  featureCount: number;
  onViewFeatures: () => void;
  onDismiss: () => void;
}

export function NewFeatureBanner({ featureCount, onViewFeatures, onDismiss }: Props) {
  return (
    <Alert
      message={
        <Space>
          <span>本次更新新增了 {featureCount} 个新功能</span>
          <Button type="primary" size="small" onClick={onViewFeatures}>
            查看新功能
          </Button>
          <Button size="small" onClick={onDismiss}>
            忽略
          </Button>
        </Space>
      }
      icon={<BulbOutlined />}
      showIcon
      closable={false}
      style={{
        marginBottom: 12,
        background: themeColors.amberBg,
        border: `1px solid ${themeColors.amberLight}`,
      }}
    />
  );
}
