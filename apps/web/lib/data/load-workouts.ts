import 'server-only';

import { cache } from 'react';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';
import type { ExerciseSet, ExerciseSummary } from './load-exercises';

/**
 * React `cache()` dedupes calls within a single request. Loading the dashboard
 * already calls both loadAllWorkouts (via cardio/balance/consistency loaders)
 * and loadDashboard separately — cache makes the second call free.
 */
export const loadAllWorkouts = cache(async (userId: string): Promise<DashboardWorkout[]> => {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const me = createDb({ tableName }).forUser(userId);
  const result = (await me.workouts.list()) as { data: DashboardWorkout[] };
  return (result.data ?? []).sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
});

/** One workout + every set logged within it, in (exercise, set#) order. */
export async function loadWorkoutDetail(
  userId: string,
  startTime: string,
): Promise<{ workout: DashboardWorkout | null; sets: ExerciseSet[] } | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const me = createDb({ tableName }).forUser(userId);
  const [workoutRes, setsRes] = await Promise.all([
    me.workouts.get(startTime) as Promise<{ data: DashboardWorkout | null } | null>,
    me.sets.forWorkout(startTime) as Promise<{ data: ExerciseSet[] }>,
  ]);
  return {
    workout: workoutRes?.data ?? null,
    sets: setsRes?.data ?? [],
  };
}

/**
 * Group every workout the user has done by `title` (workout name) plus
 * `courseId` when present — same template, different sessions. Returns
 * one row per group with the count and the most recent session.
 */
export interface WorkoutGroup {
  title: string;
  courseId?: number;
  count: number;
  lastDone: string;
  avgVolume: number;
  avgOutputKj: number;
  avgDurationMin: number;
  workouts: DashboardWorkout[];
}

export async function loadWorkoutGroups(userId: string): Promise<WorkoutGroup[]> {
  const all = await loadAllWorkouts(userId);
  const buckets = new Map<string, WorkoutGroup>();
  for (const w of all) {
    if (!w.title) continue;
    if (w.isCardio || w.speedianceTrainingType === 'cardio') continue;
    const key = `${w.title}::${w.courseId ?? 'none'}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        title: w.title,
        courseId: w.courseId,
        count: 0,
        lastDone: w.startTime,
        avgVolume: 0,
        avgOutputKj: 0,
        avgDurationMin: 0,
        workouts: [],
      });
    }
    const g = buckets.get(key)!;
    g.count += 1;
    if (w.startTime > g.lastDone) g.lastDone = w.startTime;
    g.workouts.push(w);
  }
  // Compute averages.
  for (const g of buckets.values()) {
    g.avgVolume = avg(g.workouts.map((w) => w.totalCapacity ?? 0));
    g.avgOutputKj = avg(g.workouts.map((w) => (w.outputJoules ?? 0) / 1000));
    g.avgDurationMin = avg(g.workouts.map((w) => (w.durationSeconds ?? 0) / 60));
    g.workouts.sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
  }
  return [...buckets.values()].sort((a, b) => (a.lastDone > b.lastDone ? -1 : 1));
}

/**
 * Load one specific workout-title group, plus every set ever logged for any
 * session under that title. The page renders progression per exercise over
 * time (each exercise's max weight by session date).
 */
export async function loadWorkoutGroupDetail(
  userId: string,
  title: string,
  courseId?: number,
): Promise<{
  group: WorkoutGroup | null;
  exerciseAggregates: ExerciseSummary[];
  // setsByExerciseAndDate: exerciseId → array of { startTime, weight, reps }
  perExerciseHistory: Map<
    string,
    Array<{ startTime: string; maxWeight: number; volume: number; sets: number }>
  >;
  exerciseNames: Map<string, string>;
} | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const groups = await loadWorkoutGroups(userId);
  const group = groups.find(
    (g) => g.title === title && (courseId === undefined || g.courseId === courseId),
  );
  if (!group) return null;

  const me = createDb({ tableName }).forUser(userId);
  const [exercisesRes, allSetsRes] = await Promise.all([
    me.exercises.list() as Promise<{ data: ExerciseSummary[] }>,
    me.sets.listAll() as Promise<{ data: ExerciseSet[] }>,
  ]);

  const startTimes = new Set(group.workouts.map((w) => w.startTime));
  const setsInGroup = (allSetsRes.data ?? []).filter((s) => startTimes.has(s.startTime));

  const exerciseNames = new Map<string, string>();
  for (const e of exercisesRes.data ?? []) exerciseNames.set(e.exerciseId, e.name);

  // Bucket per (exerciseId, startTime) → max weight + volume + setCount
  const perExerciseHistory = new Map<
    string,
    Array<{ startTime: string; maxWeight: number; volume: number; sets: number }>
  >();
  const inner = new Map<string, Map<string, { maxWeight: number; volume: number; sets: number }>>();
  for (const s of setsInGroup) {
    if (!inner.has(s.exerciseId)) inner.set(s.exerciseId, new Map());
    const byTime = inner.get(s.exerciseId)!;
    if (!byTime.has(s.startTime)) {
      byTime.set(s.startTime, { maxWeight: 0, volume: 0, sets: 0 });
    }
    const slot = byTime.get(s.startTime)!;
    if ((s.weight ?? 0) > slot.maxWeight) slot.maxWeight = s.weight ?? 0;
    slot.volume += s.volume ?? 0;
    slot.sets += 1;
  }
  for (const [exId, byTime] of inner) {
    perExerciseHistory.set(
      exId,
      [...byTime.entries()]
        .map(([startTime, v]) => ({ startTime, ...v }))
        .sort((a, b) => (a.startTime > b.startTime ? 1 : -1)),
    );
  }

  // Per-exercise summary across this workout group only (vs. lifetime
  // aggregates which would include the same exercise in other workouts).
  const groupExercises: ExerciseSummary[] = [...inner.keys()].map((exId) => {
    const lifetime = exercisesRes.data?.find((e) => e.exerciseId === exId);
    const history = perExerciseHistory.get(exId) ?? [];
    const allWeights = history.map((h) => h.maxWeight).filter((w) => w > 0);
    const bestInGroup = allWeights.length > 0 ? Math.max(...allWeights) : 0;
    const last = history[history.length - 1];
    return {
      exerciseId: exId,
      name: exerciseNames.get(exId) ?? `Exercise ${exId}`,
      muscleGroup: lifetime?.muscleGroup,
      isUnilateral: lifetime?.isUnilateral,
      bestWeight: bestInGroup,
      workingWeight: last?.maxWeight ?? lifetime?.workingWeight,
      lastDone: last?.startTime ?? lifetime?.lastDone,
      totalSets: history.reduce((s, h) => s + h.sets, 0),
    };
  });

  return {
    group,
    exerciseAggregates: groupExercises.sort((a, b) => (b.totalSets ?? 0) - (a.totalSets ?? 0)),
    perExerciseHistory,
    exerciseNames,
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
