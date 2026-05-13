import { randomUUID } from 'node:crypto';

import type { UserScopedDb } from '@speediance/db';
import { z } from 'zod';

import { clampWeight } from './safety/weight-cap.js';
import type { ExerciseSet, ExerciseSummary, WorkoutRow } from './types.js';

/**
 * The four MCP tools exposed to Claude Desktop (roadmap §3.9). Each
 * mirrors a coach-side capability that already exists in
 * `apps/web/lib/coach/tools.ts`. We re-implement (rather than import)
 * because the web file is gated by `'server-only'` and pulls in
 * Next-specific helpers; the slice we need here is small.
 *
 * Mapping:
 *   getLastSession      ← list_recent_workouts (limit=1)
 *   getExerciseHistory  ← get_exercise_history
 *   proposeWorkout      ← create_workout_draft
 *   logCoachingNote     ← memories.put (the entity the in-app coach
 *                          already uses for persistent context)
 *
 * Each handler is `(db, args) => Promise<unknown>` so tests can inject
 * a fake `UserScopedDb`. The shape returned is small and deterministic —
 * Claude's stdio client sees it as JSON, no DynamoDB attribute soup.
 */

// ─── Input schemas (zod) ────────────────────────────────────────────────
// Kept loose-but-typed: the MCP SDK uses these both for the
// tools/list JSON Schema and for runtime validation of incoming args.

const getLastSessionInput = {} as const;

const getExerciseHistoryInput = {
  exerciseId: z
    .string()
    .min(1)
    .describe(
      'The actionLibraryGroupId from your exercise list. Pass exactly as stored; do not invent IDs.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('How many sets back to return (default 50, max 200).'),
} as const;

const proposeWorkoutInput = {
  name: z.string().min(1).describe('Short workout name, e.g. "Upper push — Tue".'),
  notes: z.string().optional().describe('Optional 1-2 sentence focus / rationale.'),
  exercises: z
    .array(
      z.object({
        groupId: z
          .string()
          .min(1)
          .describe(
            'Exercise groupId from the Speediance catalog. Pass as string even if it looks numeric.',
          ),
        sets: z
          .array(
            z.object({
              reps: z.number().int().min(1),
              weight: z
                .number()
                .positive()
                .optional()
                .describe('Pounds. Omit to leave the user to fill in.'),
              restSeconds: z.number().int().min(0).optional().describe('Default 60.'),
            }),
          )
          .min(1)
          .describe(
            'One entry per set. For 3×10 at 50 lb, pass three identical {reps:10, weight:50} sets.',
          ),
        notes: z.string().optional(),
      }),
    )
    .min(1)
    .describe('Ordered list of exercises — order is preserved in the builder UI.'),
} as const;

const logCoachingNoteInput = {
  text: z
    .string()
    .min(1)
    .describe(
      'The memory body. Write it in third person about the user — Claude reads these on every future session.',
    ),
  category: z
    .string()
    .optional()
    .describe('Free-form tag: "injury", "preference", "goal", "schedule", etc.'),
  meta: z
    .record(z.unknown())
    .optional()
    .describe('Optional structured payload (parsed into JSON before storage). Opaque to the DB.'),
} as const;

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleGetLastSession(db: UserScopedDb): Promise<unknown> {
  const result = (await db.workouts.list()) as { data: WorkoutRow[] };
  const sorted = (result.data ?? []).slice().sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
  const w = sorted[0];
  if (!w) return { message: 'No prior workouts logged for this user.' };
  return {
    startTime: w.startTime,
    title: w.title,
    isCardio: w.isCardio || w.speedianceTrainingType === 'cardio',
    durationMinutes:
      w.durationSeconds !== undefined ? Math.round(w.durationSeconds / 60) : undefined,
    totalCapacity: w.totalCapacity,
    outputKj: w.outputJoules !== undefined ? Math.round(w.outputJoules / 1000) : undefined,
    calories: w.calories,
    distanceMiles: w.distanceMiles,
    muscleGroupSets: w.muscleGroupSets,
  };
}

async function handleGetExerciseHistory(
  db: UserScopedDb,
  args: { exerciseId: string; limit?: number },
): Promise<unknown> {
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const allSets = (await db.sets.listAll()) as { data: ExerciseSet[] };
  const matches = (allSets.data ?? [])
    .filter((s) => s.exerciseId === args.exerciseId)
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1))
    .slice(0, limit);
  return matches.map((s) => ({
    startTime: s.startTime,
    setNum: s.setNum,
    weight: s.weight,
    startWeight: s.startWeight,
    endWeight: s.endWeight,
    finishedReps: s.finishedReps,
    targetReps: s.targetReps,
    volume: s.volume,
    formFlags: s.formFlags,
    leftRight: s.leftRight,
  }));
}

interface ProposeWorkoutArgs {
  name: string;
  notes?: string;
  exercises: Array<{
    groupId: string;
    sets: Array<{ reps: number; weight?: number; restSeconds?: number }>;
    notes?: string;
  }>;
}

async function handleProposeWorkout(db: UserScopedDb, args: ProposeWorkoutArgs): Promise<unknown> {
  // Safety cap (§3.6): clamp every supplied weight to within
  // 5% of the user's PR / 15% of working weight for that exercise.
  // This is enforced server-side because prompt-level safety is advisory.
  const exRes = (await db.exercises.list()) as { data: ExerciseSummary[] };
  const byId = new Map((exRes.data ?? []).map((e) => [e.exerciseId, e]));
  const capped: Array<{ groupId: string; from: number; to: number }> = [];
  const normalized = args.exercises.map((ex) => ({
    groupId: ex.groupId,
    notes: ex.notes,
    sets: ex.sets.map((set) => {
      if (typeof set.weight !== 'number') return { ...set };
      const history = byId.get(ex.groupId);
      if (!history) return { ...set };
      const result = clampWeight(set.weight, {
        bestWeight: history.bestWeight,
        workingWeight: history.workingWeight,
      });
      if (result.capped) {
        capped.push({ groupId: ex.groupId, from: set.weight, to: result.weight });
        return { ...set, weight: result.weight };
      }
      return { ...set };
    }),
  }));

  const draftId = randomUUID().replace(/-/g, '').slice(0, 16);
  await db.workoutDrafts.upsert({
    draftId,
    name: args.name,
    notes: args.notes,
    exercises: normalized,
    status: 'draft',
    createdAt: new Date().toISOString(),
  });

  const safetyNote =
    capped.length > 0
      ? ` Safety cap applied to ${capped.length} set(s): ${capped
          .slice(0, 3)
          .map((c) => `groupId ${c.groupId} ${c.from}→${c.to} lb`)
          .join(', ')}${capped.length > 3 ? ', …' : ''}.`
      : '';

  return {
    ok: true,
    draftId,
    builderPath: `/builder/${draftId}`,
    cappedSets: capped.length,
    message:
      `Draft saved. Open /builder/${draftId} in the web app to review and push to Speediance.` +
      safetyNote,
  };
}

async function handleLogCoachingNote(
  db: UserScopedDb,
  args: { text: string; category?: string; meta?: Record<string, unknown> },
): Promise<unknown> {
  const createdAt = new Date().toISOString();
  await db.memories.put({
    createdAt,
    text: args.text,
    category: args.category,
    meta: args.meta ? JSON.stringify(args.meta) : undefined,
    active: true,
  });
  return {
    ok: true,
    createdAt,
    message: 'Memory stored. The in-app AI Coach loads these on every future turn for this user.',
  };
}

// ─── Tool registry ──────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (db: UserScopedDb, args: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'getLastSession',
    description:
      "Most recent completed workout: title, date, duration, output (kJ), calories, muscle-group set breakdown, and cardio flag. Use to answer 'what did I do yesterday / last session'. Returns a single workout, or {message} if none logged.",
    inputSchema: getLastSessionInput,
    handler: (db) => handleGetLastSession(db),
  },
  {
    name: 'getExerciseHistory',
    description:
      'Set-by-set history for one exercise, newest first. Each entry: weight, reps (finished + target), volume, form flags. Pass the exerciseId (= actionLibraryGroupId) you got from the user or a prior tool call.',
    inputSchema: getExerciseHistoryInput,
    handler: (db, args) =>
      handleGetExerciseHistory(db, args as { exerciseId: string; limit?: number }),
  },
  {
    name: 'proposeWorkout',
    description:
      "Save a coach-proposed workout as a draft in the builder. Returns the draftId + /builder/{draftId} path so the user can review and push it to Speediance from the web app. Every per-set weight is server-side capped to within 5% of the user's PR / 15% of working weight for that exercise — extreme suggestions get clamped automatically.",
    inputSchema: proposeWorkoutInput,
    handler: (db, args) => handleProposeWorkout(db, args as unknown as ProposeWorkoutArgs),
  },
  {
    name: 'logCoachingNote',
    description:
      'Persist a coaching memory about the user (injuries, preferences, goals, schedule constraints). Stored against the user record so every future session — both this MCP server and the in-app coach — sees it as context.',
    inputSchema: logCoachingNoteInput,
    handler: (db, args) =>
      handleLogCoachingNote(
        db,
        args as { text: string; category?: string; meta?: Record<string, unknown> },
      ),
  },
];
