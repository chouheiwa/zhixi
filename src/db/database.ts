import Dexie, { type Table } from 'dexie';
import type {
  IncomeRecord,
  UserSettings,
  ContentDailyRecord,
  RealtimeAggrRecord,
  PanelLayout,
  TourState,
  SavedAccount,
} from '@/shared/types';
import type { EvaluationResult } from '@/shared/ml-models';

export interface SyncedDate {
  userId: string;
  date: string;
  syncedAt: number;
}

export interface SavedMLModel {
  userId: string;
  trainedAt: number;
  dataCount: number;
  rfJson: string; // RandomForest serialized JSON
  ridgeCoefficients: number[];
  scaler: { means: number[]; stds: number[] };
  labelScaler: { mean: number; std: number };
  ensembleWeights: number[];
  evaluationResult: EvaluationResult | string; // object preferred, legacy JSON string still supported
}

export interface IncomeGoal {
  userId: string;
  period: string; // "2026-03" for monthly
  targetAmount: number; // in fen (cents)
  createdAt: number;
}

/**
 * A locally cached row from Zhihu's "all creations" API. These rows are
 * maintained by the creations-store module and drive panels such as
 * "未产生收益内容". See docs/superpowers/specs/2026-04-12-creations-cache-design.md
 * for the full design.
 */
export interface CreationRecord {
  userId: string;
  contentId: string;
  contentToken: string;
  contentType: 'article' | 'answer' | 'pin';
  title: string;
  publishDate: string; // ISO YYYY-MM-DD
  readCount: number;
  upvoteCount: number;
  commentCount: number;
  collectCount: number;
  firstSeenAt: number; // ms timestamp — first time this row was cached locally
  lastFetchedAt: number; // ms timestamp — last time the row was (re)fetched from the API
}

class ZhihuAnalysisDB extends Dexie {
  incomeRecords!: Table<IncomeRecord>;
  userSettings!: Table<UserSettings>;
  contentDaily!: Table<ContentDailyRecord>;
  syncedDates!: Table<SyncedDate>;
  mlModels!: Table<SavedMLModel>;
  realtimeAggr!: Table<RealtimeAggrRecord>;
  contentDailyCache!: Table<ContentDailyRecord>;
  incomeGoals!: Table<IncomeGoal>;
  panelLayout!: Table<PanelLayout>;
  tourState!: Table<TourState>;
  savedAccounts!: Table<SavedAccount, string>;
  creations!: Table<CreationRecord>;

  constructor() {
    super('zhihu-income-analysis-v2');
    this.version(1).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
    });
    this.version(2).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
    });
    this.version(3).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
    });
    this.version(4).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
    });
    this.version(5).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
    });
    this.version(6).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
    });
    this.version(7).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
    });
    this.version(8).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
      panelLayout: 'userId',
    });
    this.version(9).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
      panelLayout: 'userId',
      tourState: 'userId',
    });
    this.version(10).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
      contentDaily: '[userId+contentToken+date], [userId+contentToken], contentToken, date, userId',
      syncedDates: '[userId+date], userId',
      mlModels: 'userId',
      realtimeAggr: '[userId+date], userId, date',
      contentDailyCache: '[userId+contentToken], userId',
      incomeGoals: '[userId+period], userId',
      panelLayout: 'userId',
      tourState: 'userId',
      savedAccounts: 'userId',
    });

    this.version(11).stores({
      savedAccounts: 'userId, lastUsedAt',
    });

    this.version(12).stores({
      creations: '[userId+contentId], userId, [userId+contentType], [userId+publishDate]',
    });
  }
}

export const db = new ZhihuAnalysisDB();

// Clean up old database from previous versions
Dexie.delete('zhihu-income-analysis').catch(() => {});
