/**
 * Shared ECharts configuration — editorial theme.
 */

import { themeColors } from '../theme';

/** DataZoom for time-series charts (slider + inside scroll) */
export const timeSeriesZoom = {
  dataZoom: [
    {
      type: 'inside' as const,
      xAxisIndex: 0,
      filterMode: 'filter' as const,
    },
    {
      type: 'slider' as const,
      xAxisIndex: 0,
      height: 20,
      bottom: 0,
      borderColor: 'transparent',
      backgroundColor: themeColors.paper,
      fillerColor: 'rgba(184, 134, 78, 0.15)',
      handleStyle: { color: themeColors.amber },
      textStyle: { fontSize: 10, color: themeColors.muted },
    },
  ],
};

/** Toolbox with zoom for scatter/non-timeseries charts */
export const scatterZoomToolbox = {
  toolbox: {
    feature: {
      dataZoom: { title: { zoom: '缩放', back: '还原' } },
      restore: { title: '还原' },
    },
    right: 10,
    top: 0,
    iconStyle: { borderColor: themeColors.muted },
  },
};

/** Adjust grid bottom to make room for slider */
export function withZoomGrid(grid: Record<string, unknown>): Record<string, unknown> {
  return { ...grid, bottom: Math.max(Number(grid.bottom ?? 25) + 28, 50) };
}

/** Default chart text style */
export const chartTextStyle = {
  textStyle: {
    fontFamily: '"Source Han Sans SC", -apple-system, "PingFang SC", sans-serif',
    color: themeColors.body,
  },
};

/** Common axis styling */
export const chartAxisStyle = {
  axisLabel: { fontSize: 10, color: themeColors.muted },
  axisLine: { lineStyle: { color: themeColors.border } },
  splitLine: { lineStyle: { color: themeColors.border, type: 'dashed' as const } },
  axisTick: { show: false },
};

/** Get chart color palette */
export function getChartColors(): string[] {
  return themeColors.chart;
}
