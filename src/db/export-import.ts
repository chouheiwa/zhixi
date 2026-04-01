import { db } from './database';
import { upsertIncomeRecords } from './income-store';
import type { IncomeRecord } from '@/shared/types';

interface ExportData {
  version: number;
  exportedAt: number;
  records: IncomeRecord[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const REQUIRED_STRING_FIELDS = [
  'userId',
  'contentId',
  'recordDate',
  'contentType',
  'title',
  'contentToken',
  'publishDate',
] as const;

const REQUIRED_NUMBER_FIELDS = ['currentIncome', 'currentRead', 'currentInteraction'] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateImportRecord(record: unknown): { valid: boolean; error?: string } {
  if (!isObjectRecord(record)) {
    return { valid: false, error: '记录必须是对象' };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === '') {
      return { valid: false, error: `缺少必要字段: ${field}` };
    }
    if (typeof value !== 'string') {
      return { valid: false, error: `字段 ${field} 必须是 string` };
    }
  }

  for (const field of REQUIRED_NUMBER_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) {
      return { valid: false, error: `缺少必要字段: ${field}` };
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { valid: false, error: `字段 ${field} 必须是 number` };
    }
    if (value < 0) {
      return { valid: false, error: `字段 ${field} 不能为负数` };
    }
  }

  const recordDate = record.recordDate;
  if (typeof recordDate !== 'string' || !DATE_PATTERN.test(recordDate)) {
    return { valid: false, error: '字段 recordDate 必须匹配 YYYY-MM-DD' };
  }

  const publishDate = record.publishDate;
  if (typeof publishDate !== 'string' || !DATE_PATTERN.test(publishDate)) {
    return { valid: false, error: '字段 publishDate 必须匹配 YYYY-MM-DD' };
  }

  return { valid: true };
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

export async function importFromJSON(jsonStr: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (!isObjectRecord(parsed)) {
    throw new Error('数据格式错误');
  }
  const { version, records } = parsed;
  if (version !== 1) {
    throw new Error('不支持的数据版本');
  }
  if (!Array.isArray(records)) {
    throw new Error('数据格式错误：缺少 records 数组');
  }

  const validRecords: IncomeRecord[] = [];
  const errors: string[] = [];

  for (const [index, record] of records.entries()) {
    const validation = validateImportRecord(record);
    if (!validation.valid) {
      errors.push(`第 ${index + 1} 条记录：${validation.error ?? '数据无效'}`);
      continue;
    }
    validRecords.push(record as IncomeRecord);
  }

  if (validRecords.length > 0) {
    await upsertIncomeRecords(validRecords);
  }

  return {
    imported: validRecords.length,
    skipped: records.length - validRecords.length,
    errors,
  };
}
