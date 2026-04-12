import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrencyUnit,
  setCurrencyUnit,
  convertFromSalt,
  formatIncome,
  formatIncomeShort,
  currencyPrefix,
  currencySuffix,
  currencyLabel,
  currencyPrecision,
  formatValue,
  formatAxisValue,
  rpmPrefix,
  rpmSuffix,
} from '@/shared/currency';

describe('currency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCurrencyUnit', () => {
    it("defaults to 'yuan' when nothing is stored", () => {
      expect(getCurrencyUnit()).toBe('yuan');
    });

    it("returns 'salt' when the stored value is 'salt'", () => {
      localStorage.setItem('zhixi-currency-unit', 'salt');
      expect(getCurrencyUnit()).toBe('salt');
    });

    it("falls back to 'yuan' when the stored value is unrecognised", () => {
      localStorage.setItem('zhixi-currency-unit', 'dogecoin');
      expect(getCurrencyUnit()).toBe('yuan');
    });

    it("falls back to 'yuan' when localStorage access throws", () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
        throw new Error('denied');
      });
      expect(getCurrencyUnit()).toBe('yuan');
      spy.mockRestore();
    });
  });

  describe('setCurrencyUnit', () => {
    it('persists the unit to localStorage', () => {
      setCurrencyUnit('salt');
      expect(localStorage.getItem('zhixi-currency-unit')).toBe('salt');
    });

    it('silently ignores localStorage write errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('quota');
      });
      expect(() => setCurrencyUnit('yuan')).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('convertFromSalt', () => {
    it("returns the raw value when unit is 'salt'", () => {
      expect(convertFromSalt(1234, 'salt')).toBe(1234);
    });

    it("divides by 100 when unit is 'yuan'", () => {
      expect(convertFromSalt(12345, 'yuan')).toBeCloseTo(123.45, 5);
    });

    it('handles zero', () => {
      expect(convertFromSalt(0, 'salt')).toBe(0);
      expect(convertFromSalt(0, 'yuan')).toBe(0);
    });
  });

  describe('formatIncome', () => {
    it("uses 盐粒 suffix for 'salt'", () => {
      expect(formatIncome(1234, 'salt')).toBe('1234盐粒');
    });

    it('rounds salt values to the nearest integer', () => {
      expect(formatIncome(1234.6, 'salt')).toBe('1235盐粒');
    });

    it("uses ¥ prefix and 2-decimal precision for 'yuan'", () => {
      expect(formatIncome(12345, 'yuan')).toBe('¥123.45');
    });

    it('rounds yuan to 2 decimals', () => {
      expect(formatIncome(100, 'yuan')).toBe('¥1.00');
      expect(formatIncome(123, 'yuan')).toBe('¥1.23');
    });
  });

  describe('formatIncomeShort', () => {
    it('uses 万 suffix above 10k (yuan)', () => {
      // 123_4500 fen → 12345 yuan → "¥1.2万"
      expect(formatIncomeShort(123_4500, 'yuan')).toBe('¥1.2万');
    });

    it('uses 千 suffix above 1k (yuan)', () => {
      // 5000_00 fen → 5000 yuan → "¥5.0千"
      expect(formatIncomeShort(5000_00, 'yuan')).toBe('¥5.0千');
    });

    it('uses plain fixed format below 1k (yuan)', () => {
      expect(formatIncomeShort(500_00, 'yuan')).toBe('¥500.00');
    });

    it('uses 万盐粒 suffix above 10k salt', () => {
      expect(formatIncomeShort(12000, 'salt')).toBe('1.2万盐粒');
    });

    it('uses 千盐粒 suffix between 1k and 10k salt', () => {
      expect(formatIncomeShort(5000, 'salt')).toBe('5.0千盐粒');
    });

    it('falls through to plain 盐粒 below 1k salt', () => {
      expect(formatIncomeShort(500, 'salt')).toBe('500盐粒');
    });
  });

  describe('prefix / suffix / label / precision', () => {
    it('yuan prefixes with ¥ and no suffix', () => {
      expect(currencyPrefix('yuan')).toBe('¥');
      expect(currencySuffix('yuan')).toBe('');
    });

    it('salt has no prefix but a 盐粒 suffix', () => {
      expect(currencyPrefix('salt')).toBe('');
      expect(currencySuffix('salt')).toBe(' 盐粒');
    });

    it('label and precision per unit', () => {
      expect(currencyLabel('yuan')).toBe('元');
      expect(currencyLabel('salt')).toBe('盐粒');
      expect(currencyPrecision('yuan')).toBe(2);
      expect(currencyPrecision('salt')).toBe(0);
    });
  });

  describe('formatValue', () => {
    it('formats a pre-converted yuan value with 2 decimals', () => {
      expect(formatValue(12.34, 'yuan')).toBe('¥12.34');
    });

    it('formats a pre-converted salt value as an integer', () => {
      expect(formatValue(1234.7, 'salt')).toBe('1235盐粒');
    });
  });

  describe('formatAxisValue', () => {
    it('formats yuan axis with no decimals', () => {
      expect(formatAxisValue(12.6, 'yuan')).toBe('¥13');
    });

    it('formats salt axis as an integer string without suffix', () => {
      expect(formatAxisValue(1234.5, 'salt')).toBe('1235');
    });
  });

  describe('rpm helpers', () => {
    it('rpmPrefix / rpmSuffix mirror currency helpers', () => {
      expect(rpmPrefix('yuan')).toBe('¥');
      expect(rpmPrefix('salt')).toBe('');
      expect(rpmSuffix('yuan')).toBe('');
      expect(rpmSuffix('salt')).toBe(' 盐粒');
    });
  });
});
