import Dexie, { type Table } from 'dexie';
import type { IncomeRecord, UserSettings } from '@/shared/types';

class ZhihuAnalysisDB extends Dexie {
  incomeRecords!: Table<IncomeRecord>;
  userSettings!: Table<UserSettings>;

  constructor() {
    super('zhihu-income-analysis');
    this.version(1).stores({
      incomeRecords: '[contentId+recordDate], recordDate, contentType, contentId',
    });
    this.version(2).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
    }).upgrade(tx => {
      return tx.table('incomeRecords').toCollection().modify(record => {
        if (!record.userId) record.userId = '';
      });
    });
    // v3: add userSettings table
    this.version(3).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
      userSettings: 'userId',
    });
  }
}

export const db = new ZhihuAnalysisDB();
