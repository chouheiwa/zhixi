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

/** Message types for chrome.runtime messaging */
export type MessageAction =
  | { action: 'fetchProxy'; url: string }
  | { action: 'collectIncome'; startDate: string; endDate: string }
  | { action: 'getCollectionStatus' }
  | { action: 'openDashboard' };
