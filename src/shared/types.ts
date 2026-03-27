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

/** Per-user settings stored in DB */
export interface UserSettings {
  userId: string;
  /** The start date from which to collect data (user-chosen) */
  collectStartDate: string;
}

/** Message types for chrome.runtime messaging */
export type MessageAction =
  | { action: 'fetchProxy'; url: string }
  | { action: 'syncIncome' }
  | { action: 'startCollect'; startDate: string; endDate: string }
  | { action: 'getCollectStatus' }
  | { action: 'openDashboard' };
