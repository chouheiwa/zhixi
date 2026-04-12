/**
 * Canvas-based card renderer tests.
 *
 * happy-dom does not implement Canvas 2D, so we stub `getContext('2d')` with
 * a chainable no-op proxy (every property is a no-op function or another
 * proxy). This lets every draw call in card-renderer.ts execute without
 * throwing, so we can drive the full render* functions end-to-end and verify
 * they resolve to a Blob. We don't assert pixel output here — the goal is
 * coverage of the code paths and a smoke test that none of the draw
 * sequences throw on realistic data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnnualSummaryData, HotContentData, MilestoneData, MonthlyReportData } from '@/shared/types';

// ---------- Canvas 2D context stub ----------

type AnyFn = (...args: unknown[]) => unknown;

function createFakeContext(): CanvasRenderingContext2D {
  const noop: AnyFn = () => undefined;
  const gradient = {
    addColorStop: noop,
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => gradient;
      }
      if (prop === 'measureText') {
        return () => ({ width: 100 });
      }
      // Return stored scalar values (fillStyle / strokeStyle / font / globalAlpha…)
      if (prop in target) return target[prop as string];
      // Anything else: treat as a no-op draw/transform method.
      return noop;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  // Make HTMLCanvasElement hand out our stub context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    // @ts-expect-error — deliberately narrowing the overloads.
    (kind: string) => (kind === '2d' ? createFakeContext() : null),
  );
  // Ensure toBlob always resolves to a non-null Blob so render* doesn't reject.
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: (blob: Blob | null) => void,
  ) {
    callback(new Blob(['fake-png'], { type: 'image/png' }));
  });
});

const monthly: MonthlyReportData = {
  month: '2026-03',
  totalIncome: 45_67_00, // 4567 yuan
  dailyAvgIncome: 150_00, // 150 yuan
  bestDayIncome: 500_00,
  bestDayDate: '2026-03-15',
  growthRate: 0.25, // +25%
  cumulativeIncome: 12_345_00,
};

const monthlyNegative: MonthlyReportData = {
  ...monthly,
  growthRate: -0.1, // -10%
  cumulativeIncome: 50_00, // sub-silver so rank progress hits the low path
};

const milestone: MilestoneData = {
  name: '首次破千',
  achievedDate: '2026-03-15',
  totalMilestones: 5,
  cumulativeIncome: 1_000_00,
};

const hotContent: HotContentData = {
  title: 'A really compelling Zhihu answer about life, the universe, and everything',
  income: 150_00,
  pv: 123_456,
  rpm: 5_00,
  percentile: 98,
};

const hotContentShortTitle: HotContentData = {
  ...hotContent,
  title: 'Short',
  percentile: 20,
};

const annual: AnnualSummaryData = {
  year: 2026,
  totalIncome: 100_000_00,
  contentCount: 42,
  bestMonth: '3月',
  bestMonthIncome: 15_000_00,
  monthlyIncomes: [1_000, 2_000, 15_000_00, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 11_000, 12_000],
  cumulativeIncome: 100_000_00,
};

describe('card-renderer', () => {
  describe('renderMonthlyReportCard', () => {
    it('resolves with an image/png blob for a positive-growth month', async () => {
      const { renderMonthlyReportCard } = await import('@/shared/card-renderer');
      const blob = await renderMonthlyReportCard(monthly);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('handles negative growth and a low rank tier', async () => {
      const { renderMonthlyReportCard } = await import('@/shared/card-renderer');
      const blob = await renderMonthlyReportCard(monthlyNegative);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles a zero-growth edge case', async () => {
      const { renderMonthlyReportCard } = await import('@/shared/card-renderer');
      const blob = await renderMonthlyReportCard({ ...monthly, growthRate: 0 });
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  describe('renderMilestoneCard', () => {
    it('resolves with a png blob for a milestone', async () => {
      const { renderMilestoneCard } = await import('@/shared/card-renderer');
      const blob = await renderMilestoneCard(milestone);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles a milestone at the top rank', async () => {
      const { renderMilestoneCard } = await import('@/shared/card-renderer');
      const blob = await renderMilestoneCard({ ...milestone, cumulativeIncome: 50_000_00 });
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  describe('renderHotContentCard', () => {
    it('resolves with a png blob for a long-title hot content card', async () => {
      const { renderHotContentCard } = await import('@/shared/card-renderer');
      const blob = await renderHotContentCard(hotContent);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles a short title and a low percentile', async () => {
      const { renderHotContentCard } = await import('@/shared/card-renderer');
      const blob = await renderHotContentCard(hotContentShortTitle);
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  describe('renderAnnualSummaryCard', () => {
    it('resolves with a png blob for an annual summary', async () => {
      const { renderAnnualSummaryCard } = await import('@/shared/card-renderer');
      const blob = await renderAnnualSummaryCard(annual);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles an all-zero monthlyIncomes array', async () => {
      const { renderAnnualSummaryCard } = await import('@/shared/card-renderer');
      const zeroAnnual: AnnualSummaryData = {
        ...annual,
        monthlyIncomes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };
      const blob = await renderAnnualSummaryCard(zeroAnnual);
      expect(blob).toBeInstanceOf(Blob);
    });
  });

  describe('error propagation', () => {
    it('rejects when canvas.toBlob produces null', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce(function (
        this: HTMLCanvasElement,
        callback: (blob: Blob | null) => void,
      ) {
        callback(null);
      });
      const { renderMonthlyReportCard } = await import('@/shared/card-renderer');
      await expect(renderMonthlyReportCard(monthly)).rejects.toThrow('Failed to convert canvas to blob');
    });

    it('rejects when canvas.getContext returns null', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
      const { renderMilestoneCard } = await import('@/shared/card-renderer');
      await expect(renderMilestoneCard(milestone)).rejects.toThrow('Failed to get canvas context');
    });
  });
});
