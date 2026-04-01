/**
 * ZhiXi Editorial Theme — warm, literary, knowledge-oriented.
 *
 * Color palette:
 *   Paper background:  #f5f2ed
 *   Card surface:      #ffffff
 *   Deep ink:          #1a1a1a
 *   Body text:         #4a4a4a
 *   Muted text:        #8c8578
 *   Amber accent:      #b8864e  (income / highlight)
 *   Sage green:        #6b8f71  (success / positive)
 *   Warm red:          #c4594a  (error / negative)
 *   Warm blue:         #5b7a9d  (info / primary)
 */

import type { ThemeConfig } from 'antd';

export const zhixiTheme: ThemeConfig = {
  token: {
    // Colors
    colorPrimary: '#5b7a9d',
    colorSuccess: '#6b8f71',
    colorWarning: '#b8864e',
    colorError: '#c4594a',
    colorInfo: '#5b7a9d',

    // Text
    colorText: '#1a1a1a',
    colorTextSecondary: '#6b6560',
    colorTextTertiary: '#8c8578',
    colorTextQuaternary: '#b0a89e',

    // Backgrounds
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f2ed',
    colorBgSpotlight: '#efe9e0',

    // Borders
    colorBorder: '#e5dfd6',
    colorBorderSecondary: '#ede8e0',
    colorSplit: '#ede8e0',

    // Shape
    borderRadius: 6,
    borderRadiusLG: 10,
    borderRadiusSM: 4,

    // Typography
    fontFamily: '"Source Han Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    fontSize: 13,
    fontSizeLG: 15,
    fontSizeSM: 12,

    // Spacing
    padding: 16,
    paddingLG: 20,
    paddingSM: 10,
    margin: 16,

    // Effects
    boxShadow: '0 1px 3px rgba(26, 26, 26, 0.06), 0 1px 2px rgba(26, 26, 26, 0.04)',
    boxShadowSecondary: '0 4px 12px rgba(26, 26, 26, 0.08)',
  },
  components: {
    Card: {
      headerFontSize: 14,
      headerHeight: 42,
      paddingLG: 16,
    },
    Tabs: {
      cardBg: '#efe9e0',
      itemActiveColor: '#1a1a1a',
      itemSelectedColor: '#1a1a1a',
      inkBarColor: '#b8864e',
      titleFontSize: 14,
    },
    Table: {
      headerBg: '#faf7f3',
      headerColor: '#6b6560',
      headerSplitColor: '#ede8e0',
      rowHoverBg: '#faf7f3',
      borderColor: '#ede8e0',
      fontSize: 13,
    },
    Statistic: {
      titleFontSize: 11,
      contentFontSize: 22,
    },
    Button: {
      primaryShadow: '0 2px 4px rgba(91, 122, 157, 0.2)',
    },
    Tag: {
      defaultBg: '#f5f2ed',
      defaultColor: '#6b6560',
    },
    Progress: {
      defaultColor: '#b8864e',
    },
    Segmented: {
      itemSelectedBg: '#ffffff',
      trackBg: '#efe9e0',
    },
  },
};

/** Color constants for use outside Ant Design (ECharts, inline styles, etc.) */
export const themeColors = {
  // Core palette
  amber: '#b8864e',
  amberLight: '#d4a96a',
  amberBg: '#faf3ea',
  sage: '#6b8f71',
  sageBg: '#f0f5f0',
  warmBlue: '#5b7a9d',
  warmBlueBg: '#eef3f8',
  warmRed: '#c4594a',
  warmRedBg: '#faf0ee',

  // Neutrals
  ink: '#1a1a1a',
  body: '#4a4a4a',
  muted: '#8c8578',
  subtle: '#b0a89e',
  border: '#e5dfd6',
  paper: '#f5f2ed',
  card: '#ffffff',

  // Chart palette (harmonious, warm-toned)
  chart: [
    '#5b7a9d', // warm blue
    '#b8864e', // amber
    '#6b8f71', // sage green
    '#c4594a', // warm red
    '#8b7bb5', // muted purple
    '#c79a6b', // light bronze
    '#5a9e8f', // teal
    '#d4a06a', // gold
  ],
};
