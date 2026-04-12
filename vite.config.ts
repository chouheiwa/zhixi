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
      exclude: [
        'src/**/*.d.ts',
        'src/manifest.ts',
        // Pure type/interface files with no runtime code
        'src/shared/api-types.ts',
        'src/shared/message-types.ts',
        'src/shared/types.ts',
        // Entry point files (bootstrapping only, not testable in unit tests)
        'src/popup/main.tsx',
        'src/dashboard/main.tsx',
      ],
      // Thresholds set slightly below current measured coverage so normal
      // iteration doesn't turn CI red. The remaining gap vs. 100% lives in
      // heavy dashboard chart/analysis components (IncomeAttributionChart,
      // ContentFunnelAnalysis, PeakAndRhythmAnalysis, …) whose deep
      // antd/echarts/Dexie dependencies make unit-level smoke testing
      // fragile — those are better covered by E2E / visual regression.
      // Current core logic (service-worker, shared utils, hooks, db stores)
      // is all at 90%+.
      thresholds: {
        lines: 75,
        functions: 65,
        branches: 80,
        statements: 75,
      },
    },
  },
});
