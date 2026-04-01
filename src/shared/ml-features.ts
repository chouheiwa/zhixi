/**
 * Feature engineering for ML models.
 * Transforms raw daily records into rich feature vectors.
 */

import type { IncomeRecord, ContentDailyRecord } from './types';

export interface FeatureRow {
  features: number[];
  label: number; // income
  date: string;
  contentId: string;
}

/** Safe log: log(1 + x) to handle zeros */
const safeLog = (x: number) => Math.log1p(Math.max(0, x));

export const FEATURE_NAMES = [
  'pv',
  'show',
  'upvote',
  'comment',
  'collect',
  'share',
  'log_pv',
  'log_show',
  'log_upvote',
  'log_comment',
  'log_collect',
  'engagementRate',
  'upvoteRate',
  'commentRate',
  'collectRate',
  'pvSquared',
  'upvoteSquared',
  'pvXupvote',
  'pvXcomment',
  'dayOfWeek_sin',
  'dayOfWeek_cos',
  'contentAge',
  'log_contentAge',
  'pv_ma3',
  'log_pv_ma3',
  'income_lag1',
  'log_income_lag1',
];

/**
 * Build feature rows by aligning daily records with income records.
 * Each row = one content × one day.
 */
export function buildFeatureRows(dailyRecords: ContentDailyRecord[], incomeRecords: IncomeRecord[]): FeatureRow[] {
  // Index income by contentToken+date
  const incomeMap = new Map<string, IncomeRecord>();
  const publishDates = new Map<string, string>();
  for (const r of incomeRecords) {
    incomeMap.set(`${r.contentToken}:${r.recordDate}`, r);
    if (!publishDates.has(r.contentToken) || r.publishDate < publishDates.get(r.contentToken)!) {
      publishDates.set(r.contentToken, r.publishDate);
    }
  }

  // Group daily records by contentToken, sorted by date
  const byContent = new Map<string, ContentDailyRecord[]>();
  for (const r of dailyRecords) {
    const arr = byContent.get(r.contentToken) ?? [];
    arr.push(r);
    byContent.set(r.contentToken, arr);
  }

  const rows: FeatureRow[] = [];

  for (const [token, records] of byContent) {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const pubDate = publishDates.get(token);

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const income = incomeMap.get(`${token}:${r.date}`);
      if (!income || income.currentIncome <= 0) continue;

      const pv = r.pv;
      const show = r.show;
      const upvote = r.upvote;
      const comment = r.comment;
      const collect = r.collect;
      const share = r.share;

      // Ratio features (avoid division by zero)
      const totalInteraction = upvote + comment + collect + share;
      const engagementRate = pv > 0 ? totalInteraction / pv : 0;
      const upvoteRate = pv > 0 ? upvote / pv : 0;
      const commentRate = pv > 0 ? comment / pv : 0;
      const collectRate = pv > 0 ? collect / pv : 0;

      // Polynomial features
      const pvSquared = (pv * pv) / 1e6; // scale down to avoid huge numbers
      const upvoteSquared = (upvote * upvote) / 1e2;

      // Interaction features
      const pvXupvote = (pv * upvote) / 1e4;
      const pvXcomment = (pv * comment) / 1e3;

      // Time features (cyclical encoding for day of week)
      const dow = new Date(r.date).getDay();
      const dayOfWeek_sin = Math.sin((2 * Math.PI * dow) / 7);
      const dayOfWeek_cos = Math.cos((2 * Math.PI * dow) / 7);

      // Content age (days since publish)
      const contentAge = pubDate
        ? Math.max(0, (new Date(r.date).getTime() - new Date(pubDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Rolling average: pv moving average over last 3 days
      let pv_ma3 = pv;
      if (i >= 2) {
        pv_ma3 = (sorted[i].pv + sorted[i - 1].pv + sorted[i - 2].pv) / 3;
      } else if (i >= 1) {
        pv_ma3 = (sorted[i].pv + sorted[i - 1].pv) / 2;
      }

      // Lagged income (yesterday's income for this content)
      let income_lag1 = 0;
      if (i > 0) {
        const prevDate = sorted[i - 1].date;
        const prevIncome = incomeMap.get(`${token}:${prevDate}`);
        if (prevIncome) income_lag1 = prevIncome.currentIncome / 100;
      }

      rows.push({
        features: [
          pv,
          show,
          upvote,
          comment,
          collect,
          share,
          safeLog(pv),
          safeLog(show),
          safeLog(upvote),
          safeLog(comment),
          safeLog(collect),
          engagementRate,
          upvoteRate,
          commentRate,
          collectRate,
          pvSquared,
          upvoteSquared,
          pvXupvote,
          pvXcomment,
          dayOfWeek_sin,
          dayOfWeek_cos,
          contentAge,
          safeLog(contentAge),
          pv_ma3,
          safeLog(pv_ma3),
          income_lag1,
          safeLog(income_lag1),
        ],
        label: income.currentIncome / 100,
        date: r.date,
        contentId: r.contentId,
      });
    }
  }

  return rows;
}

/**
 * Build feature rows from income records only (no daily data needed).
 * Each row = one content aggregated.
 */
export function buildContentFeatureRows(incomeRecords: IncomeRecord[]): FeatureRow[] {
  const map = new Map<
    string,
    {
      read: number;
      interaction: number;
      income: number;
      publishDate: string;
      contentId: string;
      contentToken: string;
      dayCount: number;
    }
  >();

  for (const r of incomeRecords) {
    const e = map.get(r.contentId);
    if (e) {
      e.read += r.currentRead;
      e.interaction += r.currentInteraction;
      e.income += r.currentIncome;
      e.dayCount++;
    } else {
      map.set(r.contentId, {
        read: r.currentRead,
        interaction: r.currentInteraction,
        income: r.currentIncome,
        publishDate: r.publishDate,
        contentId: r.contentId,
        contentToken: r.contentToken,
        dayCount: 1,
      });
    }
  }

  return Array.from(map.values())
    .filter((i) => i.read > 0 && i.income > 0)
    .map((item) => {
      const engRate = item.read > 0 ? item.interaction / item.read : 0;
      const readPerDay = item.dayCount > 0 ? item.read / item.dayCount : 0;
      const incomePerDay = item.dayCount > 0 ? item.income / 100 / item.dayCount : 0;

      return {
        features: [
          item.read,
          item.interaction,
          engRate,
          readPerDay,
          incomePerDay,
          item.dayCount,
          (item.read * item.read) / 1e6,
          (item.read * item.interaction) / 1e6,
        ],
        label: item.income / 100,
        date: item.publishDate,
        contentId: item.contentId,
      };
    });
}

/**
 * Build a single feature vector for prediction (no income label needed).
 * Used for predicting income of new/unseen content.
 */
export function buildPredictionFeatures(
  record: ContentDailyRecord,
  publishDate: string,
  prevDayRecords?: ContentDailyRecord[],
  yesterdayIncome?: number,
): number[] {
  const pv = record.pv;
  const show = record.show;
  const upvote = record.upvote;
  const comment = record.comment;
  const collect = record.collect;
  const share = record.share;

  const totalInteraction = upvote + comment + collect + share;
  const engagementRate = pv > 0 ? totalInteraction / pv : 0;
  const upvoteRate = pv > 0 ? upvote / pv : 0;
  const commentRate = pv > 0 ? comment / pv : 0;
  const collectRate = pv > 0 ? collect / pv : 0;

  const pvSquared = (pv * pv) / 1e6;
  const upvoteSquared = (upvote * upvote) / 1e2;
  const pvXupvote = (pv * upvote) / 1e4;
  const pvXcomment = (pv * comment) / 1e3;

  const dow = new Date(record.date).getDay();
  const dayOfWeek_sin = Math.sin((2 * Math.PI * dow) / 7);
  const dayOfWeek_cos = Math.cos((2 * Math.PI * dow) / 7);

  const contentAge = publishDate
    ? Math.max(0, (new Date(record.date).getTime() - new Date(publishDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let pv_ma3 = pv;
  if (prevDayRecords && prevDayRecords.length >= 2) {
    pv_ma3 = (pv + prevDayRecords[prevDayRecords.length - 1].pv + prevDayRecords[prevDayRecords.length - 2].pv) / 3;
  } else if (prevDayRecords && prevDayRecords.length >= 1) {
    pv_ma3 = (pv + prevDayRecords[prevDayRecords.length - 1].pv) / 2;
  }

  const income_lag1 = yesterdayIncome ?? 0;

  return [
    pv,
    show,
    upvote,
    comment,
    collect,
    share,
    safeLog(pv),
    safeLog(show),
    safeLog(upvote),
    safeLog(comment),
    safeLog(collect),
    engagementRate,
    upvoteRate,
    commentRate,
    collectRate,
    pvSquared,
    upvoteSquared,
    pvXupvote,
    pvXcomment,
    dayOfWeek_sin,
    dayOfWeek_cos,
    contentAge,
    safeLog(contentAge),
    pv_ma3,
    safeLog(pv_ma3),
    income_lag1,
    safeLog(income_lag1),
  ];
}

// ── Normalization utilities ──

export interface Scaler {
  means: number[];
  stds: number[];
}

export function fitScaler(features: number[][]): Scaler {
  const n = features.length;
  const d = features[0]?.length ?? 0;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += features[i][j];
    means[j] = sum / n;

    let variance = 0;
    for (let i = 0; i < n; i++) variance += (features[i][j] - means[j]) ** 2;
    stds[j] = Math.sqrt(variance / n) || 1; // avoid division by zero
  }

  return { means, stds };
}

export function transformFeatures(features: number[][], scaler: Scaler): number[][] {
  return features.map((row) => row.map((v, j) => (v - scaler.means[j]) / scaler.stds[j]));
}
