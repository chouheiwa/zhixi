import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Dashboard } from './Dashboard';
import { zhixiTheme } from './theme';

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={zhixiTheme} locale={zhCN}>
    <Dashboard />
  </ConfigProvider>
);
