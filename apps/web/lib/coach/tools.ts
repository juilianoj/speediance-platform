import 'server-only';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';

import type { ExerciseSet, ExerciseSummary } from '@/lib/data/load-exercises';

/**
 * Tools the AI coach can call. Each tool is a pure function of (userId,
 * args) → JSON-serialisable result. Keeping the result shapes small and
 * obvious is important — the model gets confused if we shovel in raw
 * DynamoDB output. We pre-trim to the fields a coach actually needs.
 *
 * All tools are user-scoped: the userId comes from the authenticated
 * session, never from the model. The model literally cannot touch
 * another user's data even if it tries.
 */

export type ToolName =
  | 'list_recent_workouts'
  | 'list_exercises'
  | 'get_exercise_history'
  | 'get_weekly_summary'
  | 'propose_workout';

export interface ToolSpec {
  name: ToolName;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const COACH_TOOLS: ToolSpec[] = [
  {
    name: 'list_recent_workouts',
    description:
      'Most-recent N workouts (default 20) with title, date, volume, output (kJ), calories, duration, muscle group set breakdown, and cardio flag. Use when the user asks about recent training, last session, or "what did I do yesterday/last week".',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many workouts to return. Default 20, max 50.',
        },
      },
    },
  },
  {
    name: 'list_exercises',
    description:
      'Lifetime exercise aggregates — name, muscle group, best weight, working weight (most recent max), last done, total sets. Use when the user asks about a specific exercise, PRs, or what they have been training. Returns up to 200 exercises.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_exercise_history',
    description:
      'Set-by-set history for a single exercise. Returns every set the user has logged for the given exerciseId, sorted newest-first, with weight, reps, volume, and form flags.',
    input_schema: {
      type: 'object',
      properties: {
        exerciseId: {
          type: 'string',
          description:
            'The actionLibraryGroupId from list_exercises. Pass exactly as returned, do not invent IDs.',
        },
      },
      required: ['exerciseId'],
    },
  },
  {
    name: 'get_weekly_summary',
    description:
      'Roll-up of the last N weeks (default 12, max 26): workouts, volume, output kJ, calories, duration minutes per ISO week. Use for trend / consistency questions.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: {
          type: 'number',
          description: 'Number of weeks back from today (1–26). Default 12.',
        },
      },
    },
  },
  {
    name: 'propose_workout',
    description:
      'Save a draft training program for the user. Use this when the user asks you to plan a workout / program / split. The proposal is stored as a draft Program in DynamoDB and the user can review it on the Coach page. Returns the new program id.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short program name, e.g. "Push day — Tue".',
        },
        focus: {
          type: 'string',
          description: 'One-line focus, e.g. "chest + triceps, hypertrophy".',
        },
        reasoning: {
          type: 'string',
          description:
            'Why this program — reference the user data you used (last session date, working weight, muscle group gaps). 2–4 sentences.',
        },
        exercises: {
          type: 'array',
          description: 'Ordered list of exercises with target sets/reps/weight.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sets: { type: 'number' },
              reps: { type: 'number' },
              weight: {
                type: 'number',
                description:
                  'Target weight (lbs). Pick from history — use the last workingWeight or +5 lb progression.',
              },
              rest_seconds: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['name', 'sets', 'reps'],
          },
        },
      },
      required: ['name', 'reasoning', 'exercises'],
    },
  },
];

export async function runTool(
  userId: string,
  name: ToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { error: 'no DYNAMO_TABLE_NAME env var set' };
  const me = createDb({ tableName }).forUser(userId);

  switch (name) {
    case 'list_recent_workouts': {
      const limit = Math.min(50, Math.max(1, Number(args.limit ?? 20) | 0));
      const result = (await me.workouts.list()) as { data: DashboardWorkout[] };
      const sorted = (result.data ?? []).sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
      return sorted.slice(0, limit).map((w) => ({
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
      }));
    }
    case 'list_exercises': {
      const result = (await me.exercises.list()) as { data: ExerciseSummary[] };
      return (result.data ?? []).map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        muscleGroup: e.muscleGroup,
        bestWeight: e.bestWeight,
        workingWeight: e.workingWeight,
        lastDone: e.lastDone,
        totalSets: e.totalSets,
        isUnilateral: e.isUnilateral,
      }));
    }
    case 'get_exercise_history': {
      const exerciseId = String(args.exerciseId ?? '');
      if (!exerciseId) return { error: 'exerciseId is required' };
      const allSets = (await me.sets.listAll()) as { data: ExerciseSet[] };
      const matches = (allSets.data ?? []).filter((s) => s.exerciseId === exerciseId);
      matches.sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
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
    case 'propose_workout': {
      const programId = `prog-${Date.now()}`;
      const plan = JSON.stringify({
        focus: args.focus,
        exercises: args.exercises,
      });
      await me.programs.upsert({
        programId,
        name: String(args.name ?? 'Untitled program'),
        plan,
        coachReasoning: String(args.reasoning ?? ''),
        status: 'draft',
        weeks: 1,
        createdAt: new Date().toISOString(),
      });
      return {
        ok: true,
        programId,
        message:
          'Saved as a draft program. The user can find it on the Coach page under "Saved programs".',
      };
    }
    case 'get_weekly_summary': {
      const n = Math.min(26, Math.max(1, Number(args.weeks ?? 12) | 0));
      const result = (await me.workouts.list()) as { data: DashboardWorkout[] };
      const workouts = result.data ?? [];
      // Bucket by ISO week (Thursday-anchored, matching the sync worker).
      const today = new Date();
      const buckets: Array<{
        weekIso: string;
        workouts: number;
        volume: number;
        outputKj: number;
        calories: number;
        durationMinutes: number;
      }> = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i * 7);
        buckets.push({
          weekIso: thursdayOfIsoWeek(d),
          workouts: 0,
          volume: 0,
          outputKj: 0,
          calories: 0,
          durationMinutes: 0,
        });
      }
      const byIso = new Map(buckets.map((b) => [b.weekIso, b]));
      for (const w of workouts) {
        if (!w.weekIso) continue;
        const b = byIso.get(w.weekIso);
        if (!b) continue;
        b.workouts += 1;
        b.volume += w.totalCapacity ?? 0;
        b.outputKj += (w.outputJoules ?? 0) / 1000;
        b.calories += w.calories ?? 0;
        b.durationMinutes += (w.durationSeconds ?? 0) / 60;
      }
      return buckets;
    }
    default:
      return { error: `unknown tool: ${String(name)}` };
  }
}

function thursdayOfIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  return date.toISOString().slice(0, 10);
}
