import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type IncomeGoal } from '@/db/database';
import { getGoal, saveGoal, deleteGoal, getAllGoals } from '@/db/goal-store';

const USER_ID = 'testuser123';
const OTHER_USER = 'other_user';

const makeGoal = (overrides: Partial<IncomeGoal> = {}): IncomeGoal => ({
  userId: USER_ID,
  period: '2026-03',
  targetAmount: 10000,
  createdAt: Date.now(),
  ...overrides,
});

beforeEach(async () => {
  await db.incomeGoals.clear();
});

describe('saveGoal + getGoal', () => {
  it('round-trips a goal correctly', async () => {
    const goal = makeGoal();
    await saveGoal(goal);
    const retrieved = await getGoal(USER_ID, '2026-03');
    expect(retrieved).toEqual(goal);
  });

  it('upserts an existing goal', async () => {
    await saveGoal(makeGoal({ targetAmount: 10000 }));
    await saveGoal(makeGoal({ targetAmount: 20000 }));
    const count = await db.incomeGoals.count();
    expect(count).toBe(1);
    const retrieved = await getGoal(USER_ID, '2026-03');
    expect(retrieved?.targetAmount).toBe(20000);
  });
});

describe('getGoal', () => {
  it('returns undefined for a missing record', async () => {
    const result = await getGoal(USER_ID, '2026-03');
    expect(result).toBeUndefined();
  });

  it('returns undefined for a different period', async () => {
    await saveGoal(makeGoal({ period: '2026-03' }));
    const result = await getGoal(USER_ID, '2026-04');
    expect(result).toBeUndefined();
  });
});

describe('deleteGoal', () => {
  it('removes the record', async () => {
    await saveGoal(makeGoal());
    await deleteGoal(USER_ID, '2026-03');
    const result = await getGoal(USER_ID, '2026-03');
    expect(result).toBeUndefined();
    expect(await db.incomeGoals.count()).toBe(0);
  });

  it('is a no-op when the record does not exist', async () => {
    await expect(deleteGoal(USER_ID, '2026-03')).resolves.toBeUndefined();
  });
});

describe('getAllGoals', () => {
  it('filters by userId', async () => {
    await saveGoal(makeGoal({ period: '2026-03' }));
    await saveGoal(makeGoal({ period: '2026-04' }));
    await saveGoal(makeGoal({ userId: OTHER_USER, period: '2026-03' }));

    const goals = await getAllGoals(USER_ID);
    expect(goals).toHaveLength(2);
    expect(goals.every((g) => g.userId === USER_ID)).toBe(true);
  });

  it('returns empty array when no goals exist for user', async () => {
    await saveGoal(makeGoal({ userId: OTHER_USER, period: '2026-03' }));
    const goals = await getAllGoals(USER_ID);
    expect(goals).toHaveLength(0);
  });
});
