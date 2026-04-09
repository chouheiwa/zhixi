import { describe, expect, it } from 'vitest';
import { getDemoSummaries, getDemoRecords } from '@/dashboard/tour/demo-data';

describe('demo-data', () => {
  it('getDemoSummaries returns non-empty array', () => {
    const summaries = getDemoSummaries();
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s.date).toBeTruthy();
      expect(typeof s.totalIncome).toBe('number');
      expect(typeof s.totalRead).toBe('number');
      expect(typeof s.totalInteraction).toBe('number');
      expect(typeof s.contentCount).toBe('number');
    }
  });

  it('getDemoRecords returns non-empty array', () => {
    const records = getDemoRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r.userId).toBeTruthy();
      expect(r.contentId).toBeTruthy();
      expect(r.title).toBeTruthy();
    }
  });

  it('demo summaries have consecutive dates', () => {
    const summaries = getDemoSummaries();
    for (let i = 1; i < summaries.length; i++) {
      expect(summaries[i].date > summaries[i - 1].date).toBe(true);
    }
  });
});
