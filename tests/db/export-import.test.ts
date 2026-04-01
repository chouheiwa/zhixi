import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { upsertIncomeRecords } from '@/db/income-store';
import { exportToJSON, importFromJSON } from '@/db/export-import';
import type { IncomeRecord } from '@/shared/types';

const makeRecord = (id: string, date: string): IncomeRecord => ({
  userId: 'testuser',
  contentId: id,
  contentToken: `token${id}`,
  title: `Title ${id}`,
  contentType: 'answer',
  publishDate: '2026-03-20',
  recordDate: date,
  currentRead: 100,
  currentInteraction: 10,
  currentIncome: 50,
  totalRead: 200,
  totalInteraction: 20,
  totalIncome: 100,
  collectedAt: Date.now(),
});

beforeEach(async () => {
  await db.incomeRecords.clear();
});

describe('exportToJSON', () => {
  it('exports all records as a JSON string with metadata', async () => {
    await upsertIncomeRecords([makeRecord('1', '2026-03-27')]);
    const json = await exportToJSON();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].contentId).toBe('1');
    expect(parsed.exportedAt).toBeDefined();
  });
});

describe('importFromJSON', () => {
  it('imports records from JSON, merging with existing data', async () => {
    await upsertIncomeRecords([makeRecord('1', '2026-03-26')]);
    const importData = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      records: [makeRecord('2', '2026-03-27')],
    });
    const result = await importFromJSON(importData);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    const count = await db.incomeRecords.count();
    expect(count).toBe(2);
  });

  it('skips invalid records and returns validation errors', async () => {
    const invalidRecord = {
      ...makeRecord('3', '2026-03-28'),
      currentIncome: -1,
    };
    const importData = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      records: [makeRecord('2', '2026-03-27'), invalidRecord],
    });

    const result = await importFromJSON(importData);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('第 2 条记录');
    expect(result.errors[0]).toContain('currentIncome');

    const records = await db.incomeRecords.toArray();
    expect(records).toHaveLength(1);
    expect(records[0].contentId).toBe('2');
  });

  it('throws on invalid JSON', async () => {
    await expect(importFromJSON('not json')).rejects.toThrow();
  });

  it('throws on wrong version', async () => {
    await expect(importFromJSON(JSON.stringify({ version: 999, records: [] }))).rejects.toThrow('不支持的数据版本');
  });
});
