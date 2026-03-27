import { db } from './database';
import { upsertIncomeRecords } from './income-store';
import type { IncomeRecord } from '@/shared/types';

interface ExportData {
  version: number;
  exportedAt: number;
  records: IncomeRecord[];
}

export async function exportToJSON(): Promise<string> {
  const records = await db.incomeRecords.toArray();
  const data: ExportData = {
    version: 1,
    exportedAt: Date.now(),
    records,
  };
  return JSON.stringify(data, null, 2);
}

export async function importFromJSON(jsonStr: string): Promise<{ imported: number }> {
  let data: ExportData;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (data.version !== 1) {
    throw new Error('不支持的数据版本');
  }
  if (!Array.isArray(data.records)) {
    throw new Error('数据格式错误：缺少 records 数组');
  }
  await upsertIncomeRecords(data.records);
  return { imported: data.records.length };
}
