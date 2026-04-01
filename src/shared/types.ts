/** Current Zhihu user info */
export interface ZhihuUser {
  id: string;
  urlToken: string;
  name: string;
  avatarUrl: string;
}

/** A single content item's income data for a specific date range */
export interface IncomeRecord {
  /** User ID who owns this record */
  userId: string;
  contentId: string;
  contentToken: string;
  title: string;
  contentType: string;
  publishDate: string;
  recordDate: string;
  currentRead: number;
  currentInteraction: number;
  currentIncome: number;
  totalRead: number;
  totalInteraction: number;
  totalIncome: number;
  collectedAt: number;
}

/** Daily aggregate summary */
export interface DailySummary {
  date: string;
  totalIncome: number;
  totalRead: number;
  totalInteraction: number;
  contentCount: number;
}

/** Collection status */
export interface CollectionStatus {
  isCollecting: boolean;
  progress: number;
  total: number;
  currentDate?: string;
  error?: string;
  /** What type of collection is running */
  task?: '收益同步' | '内容详情' | '每日汇总' | '今日数据';
  /** Recent log entries */
  logs?: string[];
}

/** Per-content daily detailed metrics */
export interface ContentDailyRecord {
  /** Compound key: userId + contentToken + date */
  userId: string;
  contentToken: string;
  contentId: string;
  contentType: string;
  title: string;
  date: string;
  pv: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  play: number;
  collectedAt: number;
}

/** Daily aggregated realtime metrics (all content combined) */
export interface RealtimeAggrRecord {
  userId: string;
  date: string;
  updatedAt: string;
  pv: number;
  play: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  reaction: number;
  rePin: number;
  likeAndReaction: number;
  newUpvote: number;
  newLike: number;
  newIncrUpvoteNum: number;
  newDescUpvoteNum: number;
  newIncrLikeNum: number;
  newDescLikeNum: number;
  collectedAt: number;
}

/** Per-user settings stored in DB */
export interface UserSettings {
  userId: string;
  /** The start date from which to collect data (user-chosen) */
  collectStartDate: string;
  /** Whether auto-sync is enabled (default: true) */
  autoSyncEnabled?: boolean;
  /** Auto-sync interval in hours (default: 6) */
  autoSyncIntervalHours?: number;
  /** Timestamp of last auto-sync */
  lastAutoSyncAt?: number;
}

/** Message types for chrome.runtime messaging */
export type MessageAction =
  | { action: 'fetchProxy'; url: string }
  | { action: 'syncIncome' }
  | { action: 'startCollect'; startDate: string; endDate: string }
  | { action: 'getCollectStatus' }
  | { action: 'openDashboard' };

/** Panel visibility and order within a tab */
export interface PanelConfig {
  key: string;
  visible: boolean;
  order: number;
}

/** Tab visibility, order, and child panel configuration */
export interface TabConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  panels: PanelConfig[];
}

/** User's customized dashboard layout */
export interface PanelLayout {
  userId: string;
  tabs: TabConfig[];
}

/** Onboarding tour state per user */
export interface TourState {
  userId: string;
  completedVersion: string;
  seenFeatures: string[];
  coreCompleted: boolean;
  extendedCompleted: boolean;
}
