import React from 'react';
import { Avatar, Dropdown, Button, Flex, Typography } from 'antd';
import { UserOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons';
import type { SavedAccount } from '@/shared/types';

const { Text } = Typography;

interface AccountSwitcherProps {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  onSwitch: (userId: string) => void;
  onManage: () => void;
}

export function AccountSwitcher({ accounts, activeAccountId, onSwitch, onManage }: AccountSwitcherProps) {
  const activeAccount = accounts.find((a) => a.userId === activeAccountId) ?? accounts[0];

  if (accounts.length === 0) {
    return null;
  }

  const menuItems = [
    ...accounts.map((account) => ({
      key: account.userId,
      label: (
        <Flex align="center" gap={8} style={{ minWidth: 160 }}>
          <Avatar src={account.avatarUrl} size={24} icon={<UserOutlined />} style={{ flexShrink: 0 }} />
          <Flex vertical style={{ overflow: 'hidden' }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: account.userId === activeAccountId ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
              }}
            >
              {account.name}
            </Text>
          </Flex>
          {account.userId === activeAccountId && (
            <Text style={{ fontSize: 11, color: '#52c41a', marginLeft: 'auto' }}>✓</Text>
          )}
        </Flex>
      ),
      onClick: () => {
        if (account.userId !== activeAccountId) {
          onSwitch(account.userId);
        }
      },
    })),
    { type: 'divider' as const },
    {
      key: 'manage',
      icon: <SettingOutlined />,
      label: '管理账号',
      onClick: onManage,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <Button type="text" size="small" style={{ padding: '2px 6px', height: 'auto' }}>
        <Flex align="center" gap={6}>
          <Avatar src={activeAccount?.avatarUrl} size={22} icon={<UserOutlined />} />
          <Text
            style={{ fontSize: 12, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {activeAccount?.name ?? '未知账号'}
          </Text>
          <DownOutlined style={{ fontSize: 10, color: '#999' }} />
        </Flex>
      </Button>
    </Dropdown>
  );
}
