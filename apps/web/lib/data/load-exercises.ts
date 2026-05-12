import 'server-only';

import { createDb } from '@speediance/db';

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  muscleGroup?: string;
  isUnilateral?: boolean;
  bestWeight?: number;
  workingWeight?: number;
  lastDone?: string;
  totalSets?: number;
}

export interface ExerciseSet {
  startTime: string;
  exerciseId: string;
  setNum: number;
  weight?: number;
  startWeight?: number;
  endWeight?: number;
  finishedReps?: number;
  targetReps?: number;
  volume?: number;
  rest?: number;
  formFlags?: string[];
  leftRight?: string;
}

export async function loadExercises(userId: string): Promise<ExerciseSummary[]> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const me = createDb({ tableName }).forUser(userId);
  const result = (await me.exercises.list()) as { data: ExerciseSummary[] };
  return result.data ?? [];
}

export async function loadExerciseHistory(
  userId: string,
  exerciseId: string,
): Promise<{
  exercise: ExerciseSummary | null;
  sets: ExerciseSet[];
  /** startTime → workout title, for "this set was part of <workout>" rendering. */
  workoutTitleByStart: Map<string, string>;
}> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { exercise: null, sets: [], workoutTitleByStart: new Map() };
  const me = createDb({ tableName }).forUser(userId);

  const [exerciseRes, allSets, workoutsRes] = await Promise.all([
    me.exercises.get(exerciseId) as Promise<{ data: ExerciseSummary | null } | null>,
    me.sets.listAll() as Promise<{ data: ExerciseSet[] }>,
    me.workouts.list() as Promise<{ data: Array<{ startTime: string; title?: string }> }>,
  ]);
  const sets = (allSets.data ?? [])
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
  const workoutTitleByStart = new Map<string, string>();
  for (const w of workoutsRes.data ?? []) {
    if (w.title) workoutTitleByStart.set(w.startTime, w.title);
  }
  return {
    exercise: exerciseRes?.data ?? null,
    sets,
    workoutTitleByStart,
  };
}
