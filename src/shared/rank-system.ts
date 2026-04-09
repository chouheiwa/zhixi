export interface Rank {
  name: string;
  threshold: number; // in cents
  color: string; // primary color
  gradient: [string, string]; // gradient pair
  icon: string; // emoji or unicode symbol
}

export const RANKS: Rank[] = [
  { name: '青铜创作者', threshold: 0, color: '#CD7F32', gradient: ['#CD7F32', '#8B5A2B'], icon: '🥉' },
  { name: '白银创作者', threshold: 100_00, color: '#C0C0C0', gradient: ['#C0C0C0', '#808080'], icon: '🥈' },
  { name: '黄金创作者', threshold: 1000_00, color: '#FFD700', gradient: ['#FFD700', '#FFA500'], icon: '🥇' },
  { name: '铂金创作者', threshold: 5000_00, color: '#E5E4E2', gradient: ['#E5E4E2', '#B8B8B8'], icon: '💎' },
  { name: '钻石创作者', threshold: 20000_00, color: '#B9F2FF', gradient: ['#B9F2FF', '#00CED1'], icon: '👑' },
];

export function getRank(totalIncomeCents: number): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (totalIncomeCents >= rank.threshold) {
      current = rank;
    }
  }
  return current;
}

export function getNextRank(totalIncomeCents: number): Rank | null {
  for (const rank of RANKS) {
    if (totalIncomeCents < rank.threshold) {
      return rank;
    }
  }
  return null;
}

export function getRankProgress(totalIncomeCents: number): number {
  const currentRank = getRank(totalIncomeCents);
  const nextRank = getNextRank(totalIncomeCents);

  if (!nextRank) {
    // At max rank
    return 1;
  }

  const range = nextRank.threshold - currentRank.threshold;
  if (range <= 0) return 1;

  const progress = (totalIncomeCents - currentRank.threshold) / range;
  return Math.min(1, Math.max(0, progress));
}
