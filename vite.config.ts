import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
      },
      output: {
        manualChunks: {
          tfjs: ['@tensorflow/tfjs'],
          antd: ['antd', '@ant-design/icons'],
          echarts: ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['tests/setup/chrome-mock.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/manifest.ts'],
    },
  },
});
