import { describe, it, expect } from 'vitest';
import { RANKS, getRank, getNextRank, getRankProgress } from '@/shared/rank-system';

describe('rank-system', () => {
  describe('RANKS table', () => {
    it('is sorted by ascending threshold', () => {
      for (let i = 1; i < RANKS.length; i++) {
        expect(RANKS[i].threshold).toBeGreaterThanOrEqual(RANKS[i - 1].threshold);
      }
    });

    it('starts at zero and covers five tiers', () => {
      expect(RANKS).toHaveLength(5);
      expect(RANKS[0].threshold).toBe(0);
      expect(RANKS.map((r) => r.name)).toEqual(['青铜创作者', '白银创作者', '黄金创作者', '铂金创作者', '钻石创作者']);
    });
  });

  describe('getRank', () => {
    it('returns 青铜 for zero income', () => {
      expect(getRank(0).name).toBe('青铜创作者');
    });

    it('returns 青铜 just below the silver threshold', () => {
      expect(getRank(99_99).name).toBe('青铜创作者');
    });

    it('returns 白银 exactly at the silver threshold', () => {
      expect(getRank(100_00).name).toBe('白银创作者');
    });

    it('returns 黄金 between 1k and 5k yuan', () => {
      expect(getRank(3000_00).name).toBe('黄金创作者');
    });

    it('returns 钻石 at and above the top threshold', () => {
      expect(getRank(20000_00).name).toBe('钻石创作者');
      expect(getRank(99999_00).name).toBe('钻石创作者');
    });
  });

  describe('getNextRank', () => {
    it('returns 白银 when at 青铜', () => {
      expect(getNextRank(0)?.name).toBe('白银创作者');
    });

    it('returns 黄金 at the exact silver threshold (strict <)', () => {
      expect(getNextRank(100_00)?.name).toBe('黄金创作者');
    });

    it('returns null when already at the top rank', () => {
      expect(getNextRank(20000_00)).toBeNull();
      expect(getNextRank(999999_00)).toBeNull();
    });
  });

  describe('getRankProgress', () => {
    it('is 0 at the exact start of a tier', () => {
      expect(getRankProgress(100_00)).toBe(0);
    });

    it('is 0.5 at the midpoint between 白银 and 黄金', () => {
      const mid = (100_00 + 1000_00) / 2;
      expect(getRankProgress(mid)).toBeCloseTo(0.5, 5);
    });

    it('approaches 1 just before the next tier', () => {
      const justBefore = 1000_00 - 1;
      // Progress within 白银 → 黄金 band (100_00 to 1000_00)
      const expected = (justBefore - 100_00) / (1000_00 - 100_00);
      expect(getRankProgress(justBefore)).toBeCloseTo(expected, 5);
    });

    it('returns 1 at the top rank', () => {
      expect(getRankProgress(20000_00)).toBe(1);
      expect(getRankProgress(999999_00)).toBe(1);
    });

    it('clamps below zero (guard against anomalous inputs)', () => {
      // Negative income shouldn't happen, but the function should still clamp.
      const p = getRankProgress(-1);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });
});
