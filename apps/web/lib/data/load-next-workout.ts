import 'server-only';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';
import type { ExerciseSet, ExerciseSummary } from './load-exercises';

export interface PlannedLift {
  exerciseId: string;
  name: string;
  muscleGroup?: string;
  isUnilateral?: boolean;
  lastWeight?: number;
  lastReps?: number;
  lastTargetReps?: number;
  lastFormFlags?: string[];
  bestWeight?: number;
  recommendedWeight?: number;
  recommendNote?: string;
}

export interface NextWorkoutPlan {
  /** The reference workout (the most recent occurrence of the suggested
   *  title) we're projecting forward. */
  basedOn: DashboardWorkout;
  lifts: PlannedLift[];
}

/**
 * Find the user's most recent workout title and project the same exercise
 * list forward with progression recommendations. This is a placeholder for
 * the eventual "look at Speediance's scheduled calendar" approach — for now
 * we assume the next session is a repeat of the last one (which is usually
 * true mid-cycle on Speediance courses).
 */
export async function loadNextWorkoutPlan(userId: string): Promise<NextWorkoutPlan | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const me = createDb({ tableName }).forUser(userId);

  const [workoutsRes, exercisesRes, setsRes] = await Promise.all([
    me.workouts.list() as Promise<{ data: DashboardWorkout[] }>,
    me.exercises.list() as Promise<{ data: ExerciseSummary[] }>,
    me.sets.listAll() as Promise<{ data: ExerciseSet[] }>,
  ]);

  const workouts = (workoutsRes.data ?? [])
    .filter((w) => !(w.isCardio || w.speedianceTrainingType === 'cardio'))
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
  const reference = workouts[0];
  if (!reference) return null;

  const exById = new Map((exercisesRes.data ?? []).map((e) => [e.exerciseId, e]));

  // Pull the sets from the reference workout only — those are the
  // exercises we'll plan for next session.
  const referenceSets = (setsRes.data ?? []).filter((s) => s.startTime === reference.startTime);
  if (referenceSets.length === 0) {
    return { basedOn: reference, lifts: [] };
  }

  // Order: first occurrence in the workout.
  const order: string[] = [];
  const byEx = new Map<string, ExerciseSet[]>();
  for (const s of referenceSets) {
    if (!byEx.has(s.exerciseId)) {
      byEx.set(s.exerciseId, []);
      order.push(s.exerciseId);
    }
    byEx.get(s.exerciseId)!.push(s);
  }

  const lifts: PlannedLift[] = order.map((exerciseId) => {
    const sets = byEx.get(exerciseId)!.sort((a, b) => a.setNum - b.setNum);
    const ex = exById.get(exerciseId);
    const lastWeight = Math.max(0, ...sets.map((s) => s.weight ?? 0));
    const lastRepsTotal = sets.reduce((s, x) => s + (x.finishedReps ?? 0), 0);
    const lastTargetTotal = sets.reduce((s, x) => s + (x.targetReps ?? 0), 0);
    const flags = sets.flatMap((s) => s.formFlags ?? []);
    const hitAllTarget = lastTargetTotal === 0 || lastRepsTotal >= lastTargetTotal;
    const isolation = detectIsolation(ex?.name ?? '', ex?.isUnilateral ?? false);
    const reco = recommend({
      lastWeight,
      hitAllTarget,
      flagged: flags.length > 0,
      isolation,
    });

    return {
      exerciseId,
      name: ex?.name ?? `Exercise ${exerciseId}`,
      muscleGroup: ex?.muscleGroup,
      isUnilateral: ex?.isUnilateral,
      lastWeight: lastWeight > 0 ? lastWeight : undefined,
      lastReps: lastRepsTotal > 0 ? lastRepsTotal : undefined,
      lastTargetReps: lastTargetTotal > 0 ? lastTargetTotal : undefined,
      lastFormFlags: flags,
      bestWeight: ex?.bestWeight,
      recommendedWeight: reco?.weight,
      recommendNote: reco?.note,
    };
  });

  return { basedOn: reference, lifts };
}

function recommend(opts: {
  lastWeight: number;
  hitAllTarget: boolean;
  flagged: boolean;
  isolation: boolean;
}): { weight: number; note: string } | null {
  if (opts.lastWeight <= 0) return null;
  if (opts.flagged) return { weight: opts.lastWeight, note: 'hold — form flag last time' };
  if (opts.hitAllTarget) {
    const bump = opts.isolation ? 2.5 : 5;
    return { weight: opts.lastWeight + bump, note: `+${bump} lb · clean last set` };
  }
  return { weight: opts.lastWeight, note: 'hold — reps short last time' };
}

function detectIsolation(name: string, isUnilateral: boolean): boolean {
  if (isUnilateral) return true;
  const lower = name.toLowerCase();
  const COMPOUND = [
    'squat',
    'deadlift',
    'bench press',
    'overhead press',
    'shoulder press',
    'row',
    'pull-up',
    'pullup',
    'chinup',
    'chin-up',
    'thruster',
    'clean',
    'snatch',
  ];
  if (COMPOUND.some((k) => lower.includes(k))) return false;
  return true;
}
