import React from 'react';
import { Modal, List, Avatar, Button, Flex, Typography, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { SavedAccount } from '@/shared/types';

const { Text } = Typography;

interface AccountManagerProps {
  open: boolean;
  accounts: SavedAccount[];
  activeAccountId: string | null;
  onClose: () => void;
  onSwitch: (userId: string) => void;
  onRemove: (userId: string) => void;
}

function formatLastUsed(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

export function AccountManager({ open, accounts, activeAccountId, onClose, onSwitch, onRemove }: AccountManagerProps) {
  return (
    <Modal title="账号管理" open={open} onCancel={onClose} footer={null} width={480}>
      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          切换知乎登录账号后打开插件，新账号会自动添加
        </Text>
      </div>
      <List
        dataSource={accounts}
        renderItem={(account) => {
          const isActive = account.userId === activeAccountId;
          return (
            <List.Item
              actions={[
                !isActive && (
                  <Button key="set-default" size="small" type="link" onClick={() => onSwitch(account.userId)}>
                    设为默认
                  </Button>
                ),
                !isActive && (
                  <Button key="remove" size="small" type="link" danger onClick={() => onRemove(account.userId)}>
                    删除
                  </Button>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={<Avatar src={account.avatarUrl} size={40} icon={<UserOutlined />} />}
                title={
                  <Flex align="center" gap={8}>
                    <Text style={{ fontWeight: isActive ? 600 : 400 }}>{account.name}</Text>
                    {isActive && (
                      <Tag color="blue" style={{ marginRight: 0 }}>
                        当前
                      </Tag>
                    )}
                  </Flex>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    最近使用：{formatLastUsed(account.lastUsedAt)}
                  </Text>
                }
              />
            </List.Item>
          );
        }}
        locale={{ emptyText: '暂无保存的账号' }}
      />
    </Modal>
  );
}
