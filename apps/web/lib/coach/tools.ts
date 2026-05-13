import 'server-only';

import { randomUUID } from 'crypto';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';

import type { ProgramDraftRow } from '@/lib/builder/program-actions';
import { listExercises as listCatalog } from '@/lib/catalog/lookup';
import type { ExerciseSet, ExerciseSummary } from '@/lib/data/load-exercises';
import { loadNextWorkoutPlan } from '@/lib/data/load-next-workout';
import { clampWeight } from '@/lib/safety/weight-cap';

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
  | 'get_next_session_plan'
  | 'propose_workout'
  // Builder-integration tools (PR η):
  | 'list_catalog_exercises'
  | 'list_workout_drafts'
  | 'get_workout_draft'
  | 'create_workout_draft'
  | 'update_workout_draft'
  | 'get_balance_gaps'
  | 'get_plateau_lifts'
  // Program-integration tools (PR θ):
  | 'list_program_drafts'
  | 'get_program_draft'
  | 'create_program_draft'
  | 'update_program_draft'
  | 'schedule_program'
  | 'unschedule_program';

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
    name: 'get_next_session_plan',
    description:
      'Pre-computed recommendation for the user\'s next session of a chosen workout. If you don\'t pass `workout_title`, it returns recommendations based on their most recent workout. Always inspect the `availableWorkouts` list in the response and call this tool again with the right `workout_title` if the user mentioned a different one (e.g. "what should I do for chest day"). Returns for each lift: last weight, last reps vs target, lifetime best, suggested next weight, and a short note ("+5 lb · clean last set", "hold — form flag"). Always prefer this over inventing recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        workout_title: {
          type: 'string',
          description:
            "Exact title from the user's history (e.g. 'Sam invites you to challenge full body training A'). Omit to use the most recent workout.",
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

  // ─── Builder-integration tools ─────────────────────────────────────
  //
  // The "old" tools above answer questions about the user's history.
  // These tools let the coach *actively build* and modify the user's
  // workout drafts — which then live on /builder for the user to
  // review + push to Speediance. Prefer these over `propose_workout`
  // (which writes to the older Program table) for any new "build me
  // a workout" request.

  {
    name: 'list_catalog_exercises',
    description:
      'Search the global Speediance exercise catalog (~885 exercises) and return matches with their groupId, name, muscle group, equipment configuration (cable position, accessories, bench angle), and setup instructions. Use this BEFORE calling create_workout_draft so you have real groupIds — the Speediance API rejects custom-template saves with invalid ids. Supports filtering by name fragment and muscle group; returns up to `limit` results (default 30, max 100).',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            "Case-insensitive substring match against exercise name. E.g. 'biceps curl', 'lat pulldown'.",
        },
        muscleGroup: {
          type: 'string',
          description:
            "Filter to a specific muscle group. Speediance uses values like 'glutes', 'biceps', 'pecs', 'lats', 'quads', 'hamstrings', 'shoulders', 'core'. Try list_catalog_exercises with no filter first to see what's available.",
        },
        limit: {
          type: 'number',
          description: 'How many results to return (default 30, max 100).',
        },
      },
    },
  },
  {
    name: 'list_workout_drafts',
    description:
      "List the user's existing workout drafts — id, name, exercise count, status ('draft' / 'saved-to-speediance'). Use this before update_workout_draft so you have the right draftId, or to check whether a workout the user mentions already exists as a draft.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_workout_draft',
    description:
      'Full contents of one draft: name, notes, every exercise with its groupId and sets[]. Use this before update_workout_draft so you have the current state to diff against.',
    input_schema: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'The draftId from list_workout_drafts.' },
      },
      required: ['draftId'],
    },
  },
  {
    name: 'create_workout_draft',
    description:
      "Create a new workout draft populated with the given exercises. Returns the draftId + a URL the user can open to review the draft (/builder/[draftId]). Each exercise references a `groupId` from list_catalog_exercises and supplies one or more `sets` with reps + (optionally) weight + rest. Prefer this for any 'build me a workout' request — the user can then review, tweak, and click 'Save to Speediance' from the builder UI.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short workout name, e.g. "Upper push — Tue".' },
        notes: { type: 'string', description: 'Optional 1-2 sentences explaining the focus.' },
        exercises: {
          type: 'array',
          description: 'Ordered list of exercises — order matters for the builder UI.',
          items: {
            type: 'object',
            properties: {
              groupId: {
                type: 'string',
                description:
                  'The exercise groupId from list_catalog_exercises. Pass as a string even if it looks numeric.',
              },
              sets: {
                type: 'array',
                description:
                  'One entry per set. If the user wants 3x10 at 50 lb, pass 3 entries with reps:10, weight:50.',
                items: {
                  type: 'object',
                  properties: {
                    reps: { type: 'number' },
                    weight: {
                      type: 'number',
                      description: 'Pounds. Omit if leaving for the user to fill.',
                    },
                    restSeconds: { type: 'number', description: 'Default 60.' },
                  },
                  required: ['reps'],
                },
              },
              notes: {
                type: 'string',
                description: 'Optional per-exercise note (e.g. "superset with next exercise").',
              },
            },
            required: ['groupId', 'sets'],
          },
        },
      },
      required: ['name', 'exercises'],
    },
  },
  {
    name: 'update_workout_draft',
    description:
      "Modify an existing workout draft. Pass any subset of {name, notes, exercises} — only the supplied fields are updated. If you pass `exercises`, it REPLACES the entire list (call get_workout_draft first to preserve existing exercises you don't want to lose).",
    input_schema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        name: { type: 'string' },
        notes: { type: 'string' },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              groupId: { type: 'string' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    reps: { type: 'number' },
                    weight: { type: 'number' },
                    restSeconds: { type: 'number' },
                  },
                  required: ['reps'],
                },
              },
              notes: { type: 'string' },
            },
            required: ['groupId', 'sets'],
          },
        },
      },
      required: ['draftId'],
    },
  },
  {
    name: 'get_balance_gaps',
    description:
      "Identify muscle groups the user has under-trained over the past 30 days, vs their own 30-day average. Returns a list ordered by severity (gap percentage). Use when the user asks 'what should I work on' or you're picking exercises for a balanced workout — biasing toward gap groups beats picking blindly.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_plateau_lifts',
    description:
      "Identify lifts where the user's `bestWeight` hasn't increased in 4+ weeks despite recent sessions. Returns each with `name`, `bestWeight`, `lastDone`, `weeksSinceBestUpdate`. Use this to suggest variety / accessory work when the user says 'I'm stuck on X' or 'feel like I'm plateauing'.",
    input_schema: { type: 'object', properties: {} },
  },

  // ─── Program-integration tools (PR θ) ──────────────────────────────
  //
  // A ProgramDraft is a multi-week plan that arranges WorkoutDrafts into
  // weekly slots. The coach builds programs by:
  //   1. Calling create_workout_draft for each distinct workout in the
  //      program (often 3-5 different sessions per week).
  //   2. Calling create_program_draft with slots that reference those
  //      workout draftIds.
  //   3. Optionally calling schedule_program to push the whole thing to
  //      Speediance reservations starting a chosen date.

  {
    name: 'list_program_drafts',
    description:
      "List the user's existing program drafts — id, name, weekCount, slot count, status ('draft' / 'scheduled'). Check this before creating a new program in case the user already has one for the same purpose.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_program_draft',
    description:
      'Full contents of one program: name, notes, weekCount, slots[]. Each slot is {weekIndex, dayOfWeek, draftId, label?}. Use this before update_program_draft to preserve unmodified slots.',
    input_schema: {
      type: 'object',
      properties: {
        programId: { type: 'string', description: 'The programId from list_program_drafts.' },
      },
      required: ['programId'],
    },
  },
  {
    name: 'create_program_draft',
    description:
      'Create a new multi-week program. `slots[]` references existing WorkoutDrafts by `draftId` — usually you will create those drafts first via create_workout_draft. Returns programId + /builder/programs/[id] URL. Day-of-week is 0=Sun..6=Sat.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short program name, e.g. "4-week hypertrophy block".',
        },
        notes: {
          type: 'string',
          description: 'Goal / focus / any constraints worth remembering.',
        },
        weekCount: {
          type: 'number',
          description: 'How many weeks the program runs. 1-16.',
        },
        slots: {
          type: 'array',
          description: 'Each slot pairs a workout with a (week, day-of-week) cell.',
          items: {
            type: 'object',
            properties: {
              weekIndex: { type: 'number', description: '0-indexed week.' },
              dayOfWeek: {
                type: 'number',
                description: '0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.',
              },
              draftId: {
                type: 'string',
                description: 'A WorkoutDraft id from list_workout_drafts.',
              },
              label: {
                type: 'string',
                description: 'Optional override of the slot label (defaults to draft name).',
              },
            },
            required: ['weekIndex', 'dayOfWeek', 'draftId'],
          },
        },
      },
      required: ['name', 'weekCount', 'slots'],
    },
  },
  {
    name: 'update_program_draft',
    description:
      'Modify an existing program draft. `slots` REPLACES the whole list; fetch current state via get_program_draft first if you want to preserve some.',
    input_schema: {
      type: 'object',
      properties: {
        programId: { type: 'string' },
        name: { type: 'string' },
        notes: { type: 'string' },
        weekCount: { type: 'number' },
        slots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weekIndex: { type: 'number' },
              dayOfWeek: { type: 'number' },
              draftId: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['weekIndex', 'dayOfWeek', 'draftId'],
          },
        },
      },
      required: ['programId'],
    },
  },
  {
    name: 'schedule_program',
    description:
      "Push a program to Speediance — materializes every slot to a calendar reservation starting on `startDate`. Each underlying WorkoutDraft is auto-saved as a Speediance template if it isn't already. Idempotent: running again with a different start date moves everything. Returns the number of reservations created + any failures.",
    input_schema: {
      type: 'object',
      properties: {
        programId: { type: 'string' },
        startDate: {
          type: 'string',
          description:
            'YYYY-MM-DD. The program starts on this date; week 1 is the week containing it.',
        },
      },
      required: ['programId', 'startDate'],
    },
  },
  {
    name: 'unschedule_program',
    description:
      "Remove every Speediance reservation tied to this program and flip it back to draft status. Use when the user says 'cancel my current program' or wants to re-plan from scratch.",
    input_schema: {
      type: 'object',
      properties: {
        programId: { type: 'string' },
      },
      required: ['programId'],
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
    case 'get_next_session_plan': {
      const preferredTitle =
        typeof args.workout_title === 'string' ? args.workout_title : undefined;
      const result = await loadNextWorkoutPlan(userId, preferredTitle);
      if (!result?.plan) {
        return {
          message: 'No prior workouts to project from.',
          workouts: result?.options.map((o) => o.label) ?? [],
        };
      }
      const plan = result.plan;
      return {
        source: plan.source,
        title: plan.title,
        lastCompleted: plan.lastCompleted
          ? {
              startTime: plan.lastCompleted.startTime,
              durationMinutes: plan.lastCompleted.durationSeconds
                ? Math.round(plan.lastCompleted.durationSeconds / 60)
                : undefined,
            }
          : null,
        lifts: plan.lifts.map((l) => ({
          name: l.name,
          muscleGroup: l.muscleGroup,
          lastWeight: l.lastWeight,
          lastReps: l.lastReps,
          lastTargetReps: l.lastTargetReps,
          lastSessionDate: l.lastSessionDate,
          formFlagged: (l.lastFormFlags?.length ?? 0) > 0,
          bestWeight: l.bestWeight,
          suggestedWeight: l.recommendedWeight,
          note: l.recommendNote,
        })),
        availableWorkouts: result.options.map((o) => ({
          value: o.value,
          label: o.label,
          scheduled: o.scheduled,
        })),
      };
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
    // ─── Builder-integration tools ───────────────────────────────────
    case 'list_catalog_exercises': {
      const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
      const muscle = typeof args.muscleGroup === 'string' ? args.muscleGroup.toLowerCase() : '';
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 30) | 0));
      const catalog = await listCatalog();
      let rows = catalog;
      if (search) rows = rows.filter((e) => e.name.toLowerCase().includes(search));
      if (muscle) rows = rows.filter((e) => (e.muscleGroup ?? '').toLowerCase() === muscle);
      return rows.slice(0, limit).map((e) => ({
        groupId: e.groupId,
        name: e.name,
        muscleGroup: e.muscleGroup,
        // Equipment summary — concise for token efficiency, has everything
        // the model needs to pick exercises that share a setup.
        equipment: {
          cable: e.outPosition === undefined ? undefined : e.outPosition === 0 ? 'high' : 'low',
          accessories: e.accessoryNames,
          bench: e.benchAngle,
          isBarbell: e.isBarbell,
          isUnilateral: e.isUnilateral,
        },
        setupInstructions: e.setupInstructions,
        primaryMuscles: e.primaryMuscles,
      }));
    }

    case 'list_workout_drafts': {
      const result = (await me.workoutDrafts.list()) as {
        data: Array<{
          draftId: string;
          name: string;
          exercises?: unknown[];
          status?: string;
          updatedAt?: string;
        }>;
      };
      return (result.data ?? [])
        .map((d) => ({
          draftId: d.draftId,
          name: d.name,
          exerciseCount: Array.isArray(d.exercises) ? d.exercises.length : 0,
          status: d.status ?? 'draft',
          updatedAt: d.updatedAt,
        }))
        .sort((a, b) => (a.updatedAt && b.updatedAt && a.updatedAt > b.updatedAt ? -1 : 1));
    }

    case 'get_workout_draft': {
      const draftId = String(args.draftId ?? '');
      if (!draftId) return { error: 'draftId is required' };
      const res = (await me.workoutDrafts.get(draftId)) as {
        data: {
          draftId: string;
          name: string;
          notes?: string;
          exercises?: Array<{
            groupId: string;
            sets: Array<{ reps?: number; weight?: number; restSeconds?: number }>;
            notes?: string;
          }>;
          status?: string;
        } | null;
      };
      if (!res?.data) return { error: 'draft not found' };
      return res.data;
    }

    case 'create_workout_draft':
    case 'update_workout_draft': {
      const isCreate = name === 'create_workout_draft';
      // Common validation: exercises must be an array of {groupId, sets}.
      const rawExercises = Array.isArray(args.exercises) ? args.exercises : undefined;
      const normalized = rawExercises ? normalizeCoachExercises(rawExercises) : undefined;
      if (rawExercises && !normalized) {
        return {
          error:
            'invalid exercises payload — each must have a string groupId and a non-empty sets array.',
        };
      }

      // Hard safety cap (§3.6): clamp any per-set weight to
      // min(1.05 × bestWt, 1.15 × workingWt) using the user's own history
      // for that exercise. This runs in code so prompt jailbreaks can't
      // surface a dangerous load — the model is also told about it in the
      // system prompt, but the prompt is advisory; this is the enforcement.
      const cappedExercises: Array<{ groupId: string; from: number; to: number }> = [];
      if (normalized) {
        const exRes = (await me.exercises.list()) as { data: ExerciseSummary[] };
        const byId = new Map((exRes.data ?? []).map((e) => [e.exerciseId, e]));
        for (const ex of normalized) {
          const history = byId.get(ex.groupId);
          if (!history) continue;
          for (const set of ex.sets) {
            if (typeof set.weight !== 'number') continue;
            const result = clampWeight(set.weight, {
              bestWeight: history.bestWeight,
              workingWeight: history.workingWeight,
            });
            if (result.capped) {
              cappedExercises.push({ groupId: ex.groupId, from: set.weight, to: result.weight });
              set.weight = result.weight;
            }
          }
        }
      }
      const safetyNote =
        cappedExercises.length > 0
          ? ` Safety cap applied to ${cappedExercises.length} set(s): ${cappedExercises
              .slice(0, 3)
              .map((c) => `groupId ${c.groupId} ${c.from}→${c.to} lb`)
              .join(
                ', ',
              )}${cappedExercises.length > 3 ? ', …' : ''}. Tell the user the weight was capped to within 5% of their PR / 15% of their current working weight.`
          : '';

      if (isCreate) {
        const draftId = randomUUID().replace(/-/g, '').slice(0, 16);
        await me.workoutDrafts.upsert({
          draftId,
          name: typeof args.name === 'string' ? args.name : 'Coach-built workout',
          notes: typeof args.notes === 'string' ? args.notes : undefined,
          exercises: normalized ?? [],
          status: 'draft',
          createdAt: new Date().toISOString(),
        });
        return {
          ok: true,
          draftId,
          builderUrl: `/builder/${draftId}`,
          cappedSets: cappedExercises.length,
          message:
            'Draft created. Tell the user it lives at /builder/' +
            draftId +
            ' — they can review, tweak, and click "Save to Speediance" to push it.' +
            safetyNote,
        };
      } else {
        const draftId = String(args.draftId ?? '');
        if (!draftId) return { error: 'draftId is required' };
        const patch: Record<string, unknown> = {};
        if (typeof args.name === 'string') patch.name = args.name;
        if (typeof args.notes === 'string') patch.notes = args.notes;
        if (normalized) patch.exercises = normalized;
        if (Object.keys(patch).length === 0) return { error: 'no fields to update' };
        await me.workoutDrafts.patch(draftId, patch);
        return {
          ok: true,
          draftId,
          builderUrl: `/builder/${draftId}`,
          cappedSets: cappedExercises.length,
          ...(safetyNote ? { message: safetyNote.trim() } : {}),
        };
      }
    }

    case 'get_balance_gaps': {
      const result = (await me.workouts.list()) as { data: DashboardWorkout[] };
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - 30);
      const sums: Record<string, number> = {};
      for (const w of result.data ?? []) {
        if (new Date(w.startTime) < cutoff) continue;
        if (!w.muscleGroupSets) continue;
        for (const [g, n] of Object.entries(w.muscleGroupSets)) {
          if (typeof n === 'number') sums[g] = (sums[g] ?? 0) + n;
        }
      }
      const entries = Object.entries(sums);
      const total = entries.reduce((s, [, n]) => s + n, 0);
      if (entries.length === 0) {
        return { message: 'No muscle-group data in the last 30 days.' };
      }
      const avg = total / entries.length;
      return entries
        .map(([group, sets]) => ({
          group,
          sets,
          gapVsAvg: avg > 0 ? Math.round(((avg - sets) / avg) * 100) : 0,
        }))
        .filter((e) => e.gapVsAvg > 25)
        .sort((a, b) => b.gapVsAvg - a.gapVsAvg);
    }

    case 'get_plateau_lifts': {
      const result = (await me.exercises.list()) as { data: ExerciseSummary[] };
      const now = Date.now();
      const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
      return (result.data ?? [])
        .map((e) => {
          if (!e.lastDone || !e.bestWeight) return null;
          // We don't currently track "when the bestWeight was set" — proxy
          // with lastDone being old AND totalSets being substantial.
          // Refinement TBD when we add a `bestWeightSetAt` field.
          const lastDoneMs = new Date(e.lastDone).getTime();
          const weeksSinceLastDone = Math.floor((now - lastDoneMs) / (7 * 24 * 60 * 60 * 1000));
          if (now - lastDoneMs > FOUR_WEEKS_MS) return null; // user hasn't done it recently
          // Heuristic: working weight equals best weight, lots of sets,
          // last done within 4 weeks → probably plateaued.
          if (
            e.workingWeight !== undefined &&
            e.bestWeight !== undefined &&
            e.workingWeight >= e.bestWeight - 1 &&
            (e.totalSets ?? 0) >= 12
          ) {
            return {
              exerciseId: e.exerciseId,
              name: e.name,
              muscleGroup: e.muscleGroup,
              bestWeight: e.bestWeight,
              workingWeight: e.workingWeight,
              totalSets: e.totalSets,
              lastDone: e.lastDone,
              weeksSinceLastDone,
            };
          }
          return null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => (b.totalSets ?? 0) - (a.totalSets ?? 0));
    }

    // ─── Program-integration tools ───────────────────────────────────
    case 'list_program_drafts': {
      const result = (await me.programDrafts.list()) as {
        data: Array<{
          programId: string;
          name: string;
          weekCount?: number;
          slots?: unknown[];
          status?: string;
          scheduledStartDate?: string;
          updatedAt?: string;
        }>;
      };
      return (result.data ?? [])
        .map((p) => ({
          programId: p.programId,
          name: p.name,
          weekCount: p.weekCount ?? 1,
          slotsAssigned: Array.isArray(p.slots) ? p.slots.length : 0,
          status: p.status ?? 'draft',
          scheduledStartDate: p.scheduledStartDate,
          updatedAt: p.updatedAt,
        }))
        .sort((a, b) => (a.updatedAt && b.updatedAt && a.updatedAt > b.updatedAt ? -1 : 1));
    }

    case 'get_program_draft': {
      const programId = String(args.programId ?? '');
      if (!programId) return { error: 'programId is required' };
      const res = (await me.programDrafts.get(programId)) as { data: unknown | null };
      if (!res?.data) return { error: 'program not found' };
      return res.data;
    }

    case 'create_program_draft':
    case 'update_program_draft': {
      const isCreate = name === 'create_program_draft';
      const rawSlots = Array.isArray(args.slots) ? args.slots : undefined;
      const slots = rawSlots ? normalizeCoachSlots(rawSlots) : undefined;
      if (rawSlots && !slots) {
        return { error: 'invalid slots — each must have weekIndex, dayOfWeek, draftId.' };
      }
      const weekCount =
        typeof args.weekCount === 'number'
          ? Math.max(1, Math.min(16, args.weekCount | 0))
          : undefined;

      if (isCreate) {
        if (!slots || slots.length === 0) {
          return { error: 'create_program_draft requires at least one slot.' };
        }
        const programId = randomUUID().replace(/-/g, '').slice(0, 16);
        await me.programDrafts.upsert({
          programId,
          name: typeof args.name === 'string' ? args.name : 'Coach-built program',
          notes: typeof args.notes === 'string' ? args.notes : undefined,
          weekCount: weekCount ?? Math.max(1, ...slots.map((s) => s.weekIndex + 1)),
          slots,
          status: 'draft',
          createdAt: new Date().toISOString(),
        });
        return {
          ok: true,
          programId,
          builderUrl: `/builder/programs/${programId}`,
          message:
            'Program created. Tell the user it lives at /builder/programs/' +
            programId +
            ' — they can review the calendar grid and click "Schedule program" to push it to Speediance.',
        };
      } else {
        const programId = String(args.programId ?? '');
        if (!programId) return { error: 'programId is required' };
        const patch: Record<string, unknown> = {};
        if (typeof args.name === 'string') patch.name = args.name;
        if (typeof args.notes === 'string') patch.notes = args.notes;
        if (weekCount !== undefined) patch.weekCount = weekCount;
        if (slots) patch.slots = slots;
        if (Object.keys(patch).length === 0) return { error: 'no fields to update' };
        await me.programDrafts.patch(programId, patch);
        return { ok: true, programId, builderUrl: `/builder/programs/${programId}` };
      }
    }

    case 'schedule_program': {
      const programId = String(args.programId ?? '');
      const startDate = String(args.startDate ?? '');
      if (!programId || !startDate) {
        return { error: 'programId and startDate are required' };
      }
      const programRes = (await me.programDrafts.get(programId)) as {
        data: ProgramDraftRow | null;
      };
      if (!programRes?.data) return { error: 'program not found' };
      // Lazy import — keeps cold-path token-light for the simpler tools.
      const { scheduleProgram } = await import('@/lib/builder/program-schedule');
      const summary = await scheduleProgram(userId, programRes.data, startDate);
      return {
        ok: summary.ok,
        reservations: summary.reservations.length,
        failures: summary.failures.length,
        message: summary.message,
      };
    }

    case 'unschedule_program': {
      const programId = String(args.programId ?? '');
      if (!programId) return { error: 'programId is required' };
      const programRes = (await me.programDrafts.get(programId)) as {
        data: ProgramDraftRow | null;
      };
      if (!programRes?.data) return { error: 'program not found' };
      const { unscheduleProgram } = await import('@/lib/builder/program-schedule');
      return await unscheduleProgram(userId, programRes.data);
    }

    default:
      return { error: `unknown tool: ${String(name)}` };
  }
}

/**
 * Coerce a coach-supplied slots payload into the ProgramDraft slots
 * shape. Returns null on any malformed entry so the model gets a clear
 * "try again with valid shape" response instead of silently dropping rows.
 */
function normalizeCoachSlots(
  raw: unknown[],
): Array<{ weekIndex: number; dayOfWeek: number; draftId: string; label?: string }> | null {
  const out: Array<{ weekIndex: number; dayOfWeek: number; draftId: string; label?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const s = item as Record<string, unknown>;
    const weekIndex = typeof s.weekIndex === 'number' ? s.weekIndex : Number(s.weekIndex);
    const dayOfWeek = typeof s.dayOfWeek === 'number' ? s.dayOfWeek : Number(s.dayOfWeek);
    const draftId = typeof s.draftId === 'string' ? s.draftId : '';
    if (
      !Number.isInteger(weekIndex) ||
      weekIndex < 0 ||
      weekIndex > 15 ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6 ||
      !draftId
    ) {
      return null;
    }
    out.push({
      weekIndex,
      dayOfWeek,
      draftId,
      label: typeof s.label === 'string' ? s.label : undefined,
    });
  }
  return out;
}

/**
 * Coerce a coach-supplied exercises payload into the WorkoutDraft
 * exercises shape. Returns null if any item is malformed.
 */
function normalizeCoachExercises(raw: unknown[]): Array<{
  groupId: string;
  sets: Array<{ reps?: number; weight?: number; restSeconds?: number }>;
  notes?: string;
}> | null {
  const out: Array<{
    groupId: string;
    sets: Array<{ reps?: number; weight?: number; restSeconds?: number }>;
    notes?: string;
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const ex = item as Record<string, unknown>;
    const groupId = typeof ex.groupId === 'string' ? ex.groupId : String(ex.groupId ?? '');
    if (!groupId) return null;
    const rawSets = Array.isArray(ex.sets) ? ex.sets : null;
    if (!rawSets || rawSets.length === 0) return null;
    const sets = rawSets.map((s) => {
      const set = (s ?? {}) as Record<string, unknown>;
      return {
        reps: typeof set.reps === 'number' ? set.reps : undefined,
        weight: typeof set.weight === 'number' ? set.weight : undefined,
        restSeconds: typeof set.restSeconds === 'number' ? set.restSeconds : undefined,
      };
    });
    out.push({
      groupId,
      sets,
      notes: typeof ex.notes === 'string' ? ex.notes : undefined,
    });
  }
  return out;
}

function thursdayOfIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  return date.toISOString().slice(0, 10);
}
