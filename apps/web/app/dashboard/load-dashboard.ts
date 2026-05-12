import 'server-only';

import { createDb } from '@speediance/db';

export interface DashboardWorkout {
  startTime: string;
  title?: string;
  durationSeconds?: number;
  totalCapacity?: number;
  outputJoules?: number;
  calories?: number;
  distanceMiles?: number;
  isCardio?: boolean;
  speedianceTrainingType?: string;
  courseCategoryName?: string;
  courseId?: number;
  weekIso?: string;
  muscleGroupSets?: MuscleGroupSets;
}

export interface MuscleGroupSets {
  chest?: number;
  shoulders?: number;
  back?: number;
  core?: number;
  legs?: number;
  arms?: number;
}

export const MUSCLE_GROUP_ORDER = [
  'chest',
  'shoulders',
  'back',
  'arms',
  'legs',
  'core',
] as const satisfies ReadonlyArray<keyof MuscleGroupSets>;

export interface WeekBucket {
  weekIso: string;
  label: string;
  workouts: number;
  volume: number;
  outputKj: number;
  calories: number;
  durationMinutes: number;
}

export interface DashboardKpis {
  /** Strength sessions only (excludes cardio). */
  strengthSessions: number;
  cardioSessions: number;
  totalVolume: number;
  totalOutputKj: number;
  totalCalories: number;
  /** Avg duration of a strength session in minutes. */
  avgStrengthDurationMin: number;
  /** Output rate (kJ/min) — average across strength sessions. */
  avgOutputPerMin: number;
  /** Total miles walked/run in the window. */
  totalDistanceMiles: number;
}

export interface DashboardData {
  workouts: DashboardWorkout[];
  weeks: WeekBucket[];
  thisWeek: WeekBucket;
  /** All-window KPIs (computed across `weeks`). */
  kpis: DashboardKpis;
  /** Last 30-day totals — what the Google Sheet shows as the headline KPI strip. */
  kpis30d: DashboardKpis;
  muscleGroupSets: MuscleGroupSets;
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

  const sorted = [...workouts].sort((a, b) => (a.startTime < b.startTime ? 1 : -1));

  // ── 12-week trend buckets ──────────────────────────────────────────────
  const today = new Date();
  const buckets: WeekBucket[] = [];
  for (let i = WEEK_BUCKETS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const thursday = thursdayOfIsoWeek(d);
    buckets.push({
      weekIso: thursday,
      label: shortMonDay(thursday),
      workouts: 0,
      volume: 0,
      outputKj: 0,
      calories: 0,
      durationMinutes: 0,
    });
  }
  const bucketByIso = new Map(buckets.map((b) => [b.weekIso, b]));

  for (const w of workouts) {
    if (!w.weekIso) continue;
    const bucket = bucketByIso.get(w.weekIso);
    if (!bucket) continue;
    bucket.workouts += 1;
    bucket.volume += w.totalCapacity ?? 0;
    bucket.outputKj += (w.outputJoules ?? 0) / 1000;
    bucket.calories += w.calories ?? 0;
    bucket.durationMinutes += (w.durationSeconds ?? 0) / 60;
  }

  const thisWeekIso = thursdayOfIsoWeek(today);
  const thisWeek = bucketByIso.get(thisWeekIso) ?? buckets[buckets.length - 1] ?? emptyBucket();

  // ── 30-day window for the KPI strip ────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const recent = workouts.filter((w) => new Date(w.startTime) >= thirtyDaysAgo);
  const kpis30d = kpisFromWorkouts(recent);
  const kpis = kpisFromWorkouts(workouts);

  // ── Muscle group rollup across last-30d ────────────────────────────────
  const muscleGroupSets: MuscleGroupSets = {};
  for (const w of recent) {
    if (!w.muscleGroupSets) continue;
    for (const group of MUSCLE_GROUP_ORDER) {
      const v = w.muscleGroupSets[group];
      if (!v) continue;
      muscleGroupSets[group] = (muscleGroupSets[group] ?? 0) + v;
    }
  }

  return {
    workouts: sorted.slice(0, 12),
    weeks: buckets,
    thisWeek,
    kpis,
    kpis30d,
    muscleGroupSets,
    hasProfile: Boolean(profile),
    hasCreds: Boolean(profile?.speedianceSecretArn),
  };
}

function kpisFromWorkouts(workouts: DashboardWorkout[]): DashboardKpis {
  let strength = 0;
  let cardio = 0;
  let volume = 0;
  let outputKj = 0;
  let calories = 0;
  let strengthDurationS = 0;
  let outputPerMinSamples = 0;
  let outputPerMinSum = 0;
  let distance = 0;

  for (const w of workouts) {
    const isCardio = w.isCardio ?? w.speedianceTrainingType === 'cardio';
    if (isCardio) {
      cardio += 1;
      distance += w.distanceMiles ?? 0;
    } else {
      strength += 1;
      strengthDurationS += w.durationSeconds ?? 0;
      if (w.outputJoules && w.durationSeconds && w.durationSeconds > 0) {
        outputPerMinSum += w.outputJoules / 1000 / (w.durationSeconds / 60);
        outputPerMinSamples += 1;
      }
    }
    volume += w.totalCapacity ?? 0;
    outputKj += (w.outputJoules ?? 0) / 1000;
    calories += w.calories ?? 0;
  }

  return {
    strengthSessions: strength,
    cardioSessions: cardio,
    totalVolume: volume,
    totalOutputKj: outputKj,
    totalCalories: calories,
    avgStrengthDurationMin: strength > 0 ? strengthDurationS / 60 / strength : 0,
    avgOutputPerMin: outputPerMinSamples > 0 ? outputPerMinSum / outputPerMinSamples : 0,
    totalDistanceMiles: distance,
  };
}

function emptyBucket(): WeekBucket {
  return {
    weekIso: thursdayOfIsoWeek(new Date()),
    label: shortMonDay(thursdayOfIsoWeek(new Date())),
    workouts: 0,
    volume: 0,
    outputKj: 0,
    calories: 0,
    durationMinutes: 0,
  };
}

function emptyData(): DashboardData {
  return {
    workouts: [],
    weeks: [],
    thisWeek: emptyBucket(),
    kpis: kpisFromWorkouts([]),
    kpis30d: kpisFromWorkouts([]),
    muscleGroupSets: {},
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
