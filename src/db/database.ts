import Dexie, { type Table } from 'dexie';
import type { IncomeRecord } from '@/shared/types';

class ZhihuAnalysisDB extends Dexie {
  incomeRecords!: Table<IncomeRecord>;

  constructor() {
    super('zhihu-income-analysis');
    this.version(1).stores({
      incomeRecords: '[contentId+recordDate], recordDate, contentType, contentId',
    });
    // v2: add userId to compound key
    this.version(2).stores({
      incomeRecords: '[userId+contentId+recordDate], recordDate, contentType, contentId, userId, [userId+recordDate]',
    }).upgrade(tx => {
      // Backfill existing records with empty userId
      return tx.table('incomeRecords').toCollection().modify(record => {
        if (!record.userId) record.userId = '';
      });
    });
  }
}

export const db = new ZhihuAnalysisDB();
