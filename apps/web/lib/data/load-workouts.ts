import 'server-only';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';

export async function loadAllWorkouts(userId: string): Promise<DashboardWorkout[]> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const me = createDb({ tableName }).forUser(userId);
  const result = (await me.workouts.list()) as { data: DashboardWorkout[] };
  return (result.data ?? []).sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
}
