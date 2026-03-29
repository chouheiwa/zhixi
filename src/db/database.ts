import Dexie, { type Table } from 'dexie';
import type { IncomeRecord, UserSettings, ContentDailyRecord, RealtimeAggrRecord, PanelLayout } from '@/shared/types';

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
  evaluationResult: string; // EnsembleResult JSON (predictions, r2, mae, etc.)
}

export interface IncomeGoal {
  userId: string;
  period: string; // "2026-03" for monthly
  targetAmount: number; // in fen (cents)
  createdAt: number;
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
  }
}

export const db = new ZhihuAnalysisDB();

// Clean up old database from previous versions
Dexie.delete('zhihu-income-analysis').catch(() => {});
