import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Popup } from './Popup';

const theme = {
  token: {
    colorPrimary: '#1a73e8',
    colorSuccess: '#34a853',
    colorWarning: '#fbbc04',
    colorError: '#d32f2f',
    borderRadius: 8,
  },
};

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={theme} locale={zhCN}>
    <Popup />
  </ConfigProvider>
);
