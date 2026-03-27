import { describe, it, expect } from 'vitest';
import { formatDate, parseDateString, getDateRange, eachDayInRange } from '@/shared/date-utils';

describe('formatDate', () => {
  it('formats a Date to YYYY-MM-DD string', () => {
    expect(formatDate(new Date(2026, 2, 27))).toBe('2026-03-27');
  });
  it('zero-pads single-digit month and day', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseDateString', () => {
  it('parses YYYY-MM-DD string to Date at midnight local', () => {
    const d = parseDateString('2026-03-27');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(27);
  });
});

describe('getDateRange', () => {
  it('returns start and end date for "last 7 days" from a reference date', () => {
    const ref = new Date(2026, 2, 27);
    const { start, end } = getDateRange(7, ref);
    expect(formatDate(start)).toBe('2026-03-21');
    expect(formatDate(end)).toBe('2026-03-27');
  });
});

describe('eachDayInRange', () => {
  it('returns array of date strings for each day in range inclusive', () => {
    const days = eachDayInRange('2026-03-25', '2026-03-27');
    expect(days).toEqual(['2026-03-25', '2026-03-26', '2026-03-27']);
  });
  it('returns single day when start equals end', () => {
    const days = eachDayInRange('2026-03-27', '2026-03-27');
    expect(days).toEqual(['2026-03-27']);
  });
});
