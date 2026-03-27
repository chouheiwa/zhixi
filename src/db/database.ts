import Dexie, { type Table } from 'dexie';
import type { IncomeRecord } from '@/shared/types';

class ZhihuAnalysisDB extends Dexie {
  incomeRecords!: Table<IncomeRecord>;

  constructor() {
    super('zhihu-income-analysis');
    this.version(1).stores({
      incomeRecords: '[contentId+recordDate], recordDate, contentType, contentId',
    });
  }
}

export const db = new ZhihuAnalysisDB();
