import Dexie, { type Table } from 'dexie';
import type { IncomeRecord, UserSettings } from '@/shared/types';

class ZhihuAnalysisDB extends Dexie {
  incomeRecords!: Table<IncomeRecord>;
  userSettings!: Table<UserSettings>;

  constructor() {
    super('zhihu-income-analysis-v2');
    this.version(1).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
    });
  }
}

export const db = new ZhihuAnalysisDB();

// Clean up old database from previous versions
Dexie.delete('zhihu-income-analysis').catch(() => {});
