import type { Table } from 'dexie';
import { db } from './database';

/**
 * Names of all Dexie tables covered by export/import.
 *
 * Everything is stored locally, so a full-fidelity backup needs every table
 * (not just incomeRecords, which was the original v1 behaviour).
 */
const EXPORTABLE_TABLES = [
  'incomeRecords',
  'userSettings',
  'contentDaily',
  'syncedDates',
  'mlModels',
  'realtimeAggr',
  'contentDailyCache',
  'incomeGoals',
  'panelLayout',
  'tourState',
  'savedAccounts',
  'creations',
] as const;

export type ExportableTableName = (typeof EXPORTABLE_TABLES)[number];

type TableCounts = Partial<Record<ExportableTableName, number>>;

interface TableSpec {
  /** Required string fields (empty string is also invalid). */
  stringKeys: readonly string[];
  /** Required number fields (NaN / negative also invalid unless allowNegative). */
  numberKeys?: readonly string[];
  /** Number fields that may legitimately be negative (e.g. standardized means). */
  allowNegative?: readonly string[];
  /** Extra per-record validation, runs after generic key checks. */
  extra?: (record: Record<string, unknown>) => string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

const TABLE_SPECS: Record<ExportableTableName, TableSpec> = {
  incomeRecords: {
    stringKeys: ['userId', 'contentId', 'contentToken', 'title', 'contentType', 'publishDate', 'recordDate'],
    numberKeys: [
      'currentRead',
      'currentInteraction',
      'currentIncome',
      'totalRead',
      'totalInteraction',
      'totalIncome',
      'collectedAt',
    ],
    extra: (record) => {
      if (!isIsoDate(record.recordDate)) return 'recordDate 必须是 YYYY-MM-DD';
      if (!isIsoDate(record.publishDate)) return 'publishDate 必须是 YYYY-MM-DD';
      return null;
    },
  },
  userSettings: {
    stringKeys: ['userId'],
  },
  contentDaily: {
    stringKeys: ['userId', 'contentToken', 'contentId', 'contentType', 'title', 'date'],
    numberKeys: ['pv', 'show', 'upvote', 'comment', 'like', 'collect', 'share', 'play', 'collectedAt'],
    extra: (record) => (isIsoDate(record.date) ? null : 'date 必须是 YYYY-MM-DD'),
  },
  syncedDates: {
    stringKeys: ['userId', 'date'],
    numberKeys: ['syncedAt'],
    extra: (record) => (isIsoDate(record.date) ? null : 'date 必须是 YYYY-MM-DD'),
  },
  mlModels: {
    stringKeys: ['userId', 'rfJson'],
    numberKeys: ['trainedAt', 'dataCount'],
  },
  realtimeAggr: {
    stringKeys: ['userId', 'date', 'updatedAt'],
    numberKeys: [
      'pv',
      'play',
      'show',
      'upvote',
      'comment',
      'like',
      'collect',
      'share',
      'reaction',
      'rePin',
      'likeAndReaction',
      'newUpvote',
      'newLike',
      'newIncrUpvoteNum',
      'newDescUpvoteNum',
      'newIncrLikeNum',
      'newDescLikeNum',
      'collectedAt',
    ],
    allowNegative: ['newIncrUpvoteNum', 'newDescUpvoteNum', 'newIncrLikeNum', 'newDescLikeNum'],
    extra: (record) => (isIsoDate(record.date) ? null : 'date 必须是 YYYY-MM-DD'),
  },
  contentDailyCache: {
    stringKeys: ['userId', 'contentToken', 'contentId', 'contentType', 'title', 'date'],
    numberKeys: ['pv', 'show', 'upvote', 'comment', 'like', 'collect', 'share', 'play', 'collectedAt'],
  },
  incomeGoals: {
    stringKeys: ['userId', 'period'],
    numberKeys: ['targetAmount', 'createdAt'],
  },
  panelLayout: {
    stringKeys: ['userId'],
    extra: (record) => (Array.isArray(record.tabs) ? null : 'tabs 必须是数组'),
  },
  tourState: {
    stringKeys: ['userId', 'completedVersion'],
    extra: (record) => {
      if (!Array.isArray(record.seenFeatures)) return 'seenFeatures 必须是数组';
      if (typeof record.coreCompleted !== 'boolean') return 'coreCompleted 必须是 boolean';
      if (typeof record.extendedCompleted !== 'boolean') return 'extendedCompleted 必须是 boolean';
      return null;
    },
  },
  savedAccounts: {
    stringKeys: ['userId', 'name', 'urlToken', 'avatarUrl'],
    numberKeys: ['addedAt', 'lastUsedAt'],
  },
  creations: {
    stringKeys: ['userId', 'contentId', 'contentToken', 'contentType', 'title', 'publishDate'],
    numberKeys: ['readCount', 'upvoteCount', 'commentCount', 'collectCount', 'firstSeenAt', 'lastFetchedAt'],
    extra: (record) => (isIsoDate(record.publishDate) ? null : 'publishDate 必须是 YYYY-MM-DD'),
  },
};

export interface ExportData {
  version: 2;
  exportedAt: number;
  tables: Partial<Record<ExportableTableName, unknown[]>>;
}

/** Legacy v1 format, kept purely for import backward compatibility. */
interface LegacyExportDataV1 {
  version: 1;
  exportedAt: number;
  records: unknown[];
}

export interface ImportResult {
  /** Total rows written across every table — kept for backward compatibility. */
  imported: number;
  /** Rows skipped because validation failed. */
  skipped: number;
  /** Per-table row counts that were actually written. */
  tables: TableCounts;
  /** Human-readable validation errors (may be truncated by the caller). */
  errors: string[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAgainstSpec(record: unknown, spec: TableSpec): string | null {
  if (!isObjectRecord(record)) return '记录必须是对象';

  for (const key of spec.stringKeys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') {
      return `缺少必要字段: ${key}`;
    }
    if (typeof value !== 'string') {
      return `字段 ${key} 必须是 string`;
    }
  }

  const allowNegative = new Set(spec.allowNegative ?? []);
  for (const key of spec.numberKeys ?? []) {
    const value = record[key];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return `字段 ${key} 必须是 number`;
    }
    if (!allowNegative.has(key) && value < 0) {
      return `字段 ${key} 不能为负数`;
    }
  }

  if (spec.extra) {
    const extraError = spec.extra(record);
    if (extraError) return extraError;
  }

  return null;
}

/** Exposed for tests and for narrower callers that need to inspect a single record. */
export function validateImportRecord(
  record: unknown,
  tableName: ExportableTableName = 'incomeRecords',
): { valid: boolean; error?: string } {
  const error = validateAgainstSpec(record, TABLE_SPECS[tableName]);
  return error ? { valid: false, error } : { valid: true };
}

function getTable(name: ExportableTableName): Table<unknown, unknown> {
  return db[name] as unknown as Table<unknown, unknown>;
}

export async function exportToJSON(): Promise<string> {
  const tables: Partial<Record<ExportableTableName, unknown[]>> = {};
  for (const name of EXPORTABLE_TABLES) {
    tables[name] = await getTable(name).toArray();
  }
  const data: ExportData = {
    version: 2,
    exportedAt: Date.now(),
    tables,
  };
  return JSON.stringify(data, null, 2);
}

function parseExportPayload(jsonStr: string): ExportData | LegacyExportDataV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (!isObjectRecord(parsed)) {
    throw new Error('数据格式错误');
  }

  const { version } = parsed;
  if (version === 1) {
    if (!Array.isArray(parsed.records)) {
      throw new Error('数据格式错误：缺少 records 数组');
    }
    return {
      version: 1,
      exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : 0,
      records: parsed.records,
    };
  }

  if (version === 2) {
    if (!isObjectRecord(parsed.tables)) {
      throw new Error('数据格式错误：缺少 tables 对象');
    }
    return {
      version: 2,
      exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : 0,
      tables: parsed.tables as Partial<Record<ExportableTableName, unknown[]>>,
    };
  }

  throw new Error('不支持的数据版本');
}

async function importTable(tableName: ExportableTableName, rows: unknown, result: ImportResult): Promise<void> {
  if (rows === undefined || rows === null) return;
  if (!Array.isArray(rows)) {
    result.errors.push(`${tableName}: 不是数组，已跳过`);
    return;
  }

  const spec = TABLE_SPECS[tableName];
  const valid: unknown[] = [];
  for (const [index, row] of rows.entries()) {
    const error = validateAgainstSpec(row, spec);
    if (error) {
      result.skipped += 1;
      result.errors.push(`${tableName}[${index + 1}]: ${error}`);
      continue;
    }
    valid.push(row);
  }

  if (valid.length === 0) return;

  await getTable(tableName).bulkPut(valid);
  result.tables[tableName] = (result.tables[tableName] ?? 0) + valid.length;
  result.imported += valid.length;
}

export async function importFromJSON(jsonStr: string): Promise<ImportResult> {
  const payload = parseExportPayload(jsonStr);

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    tables: {},
    errors: [],
  };

  if (payload.version === 1) {
    await importTable('incomeRecords', payload.records, result);
    return result;
  }

  for (const name of EXPORTABLE_TABLES) {
    await importTable(name, payload.tables[name], result);
  }
  return result;
}
