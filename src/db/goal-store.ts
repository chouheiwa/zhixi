import { db, type IncomeGoal } from './database';

export async function getGoal(userId: string, period: string): Promise<IncomeGoal | undefined> {
  return db.incomeGoals.get([userId, period]);
}

export async function saveGoal(goal: IncomeGoal): Promise<void> {
  await db.incomeGoals.put(goal);
}

export async function deleteGoal(userId: string, period: string): Promise<void> {
  await db.incomeGoals.delete([userId, period]);
}

export async function getAllGoals(userId: string): Promise<IncomeGoal[]> {
  return db.incomeGoals.where('userId').equals(userId).toArray();
}
