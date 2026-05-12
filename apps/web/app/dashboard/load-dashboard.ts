import 'server-only';

import { createDb } from '@speediance/db';

export interface DashboardWorkout {
  startTime: string;
  title?: string;
  durationSeconds?: number;
  totalCapacity?: number;
  calories?: number;
  weekIso?: string;
  speedianceTrainingId?: string;
  speedianceTrainingType?: string;
}

export interface DashboardData {
  workouts: DashboardWorkout[];
  weeks: Array<{
    weekIso: string;
    label: string;
    workouts: number;
    volume: number;
    calories: number;
  }>;
  thisWeek: {
    weekIso: string;
    workouts: number;
    volume: number;
    calories: number;
  };
  hasProfile: boolean;
  hasCreds: boolean;
}

const WEEK_BUCKETS = 12;

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) {
    return emptyData();
  }
  const db = createDb({ tableName });
  const me = db.forUser(userId);

  const [profileResult, workoutsResult] = await Promise.all([
    me.profiles.get() as Promise<{ data: { speedianceSecretArn?: string } | null } | null>,
    me.workouts.list() as Promise<{ data: DashboardWorkout[] }>,
  ]);

  const profile = profileResult?.data;
  const workouts = workoutsResult.data ?? [];

  // Sort newest-first for the recent-sessions list. ElectroDB returns
  // ascending by SK; reverse to put most-recent at top.
  const sorted = [...workouts].sort((a, b) => (a.startTime < b.startTime ? 1 : -1));

  // Build last-N-weeks aggregation. `weekIso` on workout items is the
  // Thursday of the workout's ISO week; we sum volume/calories per bucket.
  const today = new Date();
  const buckets: DashboardData['weeks'] = [];
  for (let i = WEEK_BUCKETS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const thursday = thursdayOfIsoWeek(d);
    buckets.push({
      weekIso: thursday,
      label: shortMonDay(thursday),
      workouts: 0,
      volume: 0,
      calories: 0,
    });
  }
  const bucketByIso = new Map(buckets.map((b) => [b.weekIso, b]));
  for (const w of workouts) {
    if (!w.weekIso) continue;
    const bucket = bucketByIso.get(w.weekIso);
    if (!bucket) continue;
    bucket.workouts += 1;
    bucket.volume += w.totalCapacity ?? 0;
    bucket.calories += w.calories ?? 0;
  }

  const thisWeekIso = thursdayOfIsoWeek(today);
  const thisWeek = bucketByIso.get(thisWeekIso) ?? {
    weekIso: thisWeekIso,
    workouts: 0,
    volume: 0,
    calories: 0,
  };

  return {
    workouts: sorted.slice(0, 10),
    weeks: buckets,
    thisWeek: {
      weekIso: thisWeek.weekIso,
      workouts: thisWeek.workouts,
      volume: thisWeek.volume,
      calories: thisWeek.calories,
    },
    hasProfile: Boolean(profile),
    hasCreds: Boolean(profile?.speedianceSecretArn),
  };
}

function emptyData(): DashboardData {
  return {
    workouts: [],
    weeks: [],
    thisWeek: {
      weekIso: thursdayOfIsoWeek(new Date()),
      workouts: 0,
      volume: 0,
      calories: 0,
    },
    hasProfile: false,
    hasCreds: false,
  };
}

function thursdayOfIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  return date.toISOString().slice(0, 10);
}

const MON_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
function shortMonDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${MON_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
