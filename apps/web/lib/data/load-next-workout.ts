import 'server-only';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';
import { clampWeight } from '@speediance/coach-safety';
import { createRefreshingSpeedianceClient } from '@/lib/speediance/refreshing-client';

import type { ExerciseSet, ExerciseSummary } from './load-exercises';
import {
  loadNextScheduledWorkout,
  loadScheduledWorkouts,
  type ScheduledItem,
} from './load-scheduled';
import { loadAllWorkouts } from './load-workouts';

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
  /** Date of the session the "last weight" came from. May be from a
   *  different workout — we use lifetime-latest per exercise. */
  lastSessionDate?: string;
  // ── Speediance program prescription (from course curriculum) ──────
  /** Sets-and-reps array, e.g. [12, 10, 8, 10] from "12,10,8,10". */
  plannedReps?: number[];
  /** Per-set prescribed weight, e.g. [220, 220, 220, 220]. */
  plannedWeights?: number[];
  /** Top-level "Speediance recommends X" — may differ from plannedWeights
   *  (course-level default vs. user-personalised per-set). */
  speedianceRecommendedWeight?: number;
  /** User's best 1RM as recorded by Speediance, when present. */
  bestOneRepMax?: number;
  /** Rest between sets in seconds (single int — Speediance also exposes a
   *  per-set rest string but a single number is enough for the dashboard). */
  breakSeconds?: number;
}

export interface NextWorkoutPlan {
  /** Where the recommendations are derived from — describes the scheduled
   *  workout when one is found, otherwise the most-recent matching session. */
  source:
    | { kind: 'scheduled'; date: string; title?: string }
    | { kind: 'completed'; date: string; title?: string };
  /** The user's last completed session of this workout title, if any —
   *  used for the "back history" link. */
  lastCompleted: DashboardWorkout | null;
  lifts: PlannedLift[];
  /** Workout title we're planning for, for the dashboard header. */
  title?: string;
}

export interface WorkoutOption {
  /** Distinct title from the user's history (or "Upcoming: X" for scheduled). */
  value: string;
  label: string;
  scheduled?: boolean;
  scheduledDate?: string;
  count?: number;
  lastDone?: string;
}

export interface CurriculumEntry {
  id: number;
  title: string;
  plannedReps?: number[];
  plannedWeights?: number[];
  speedianceRecommendedWeight?: number;
  bestOneRepMax?: number;
  breakSeconds?: number;
  isUnilateral?: boolean;
}

// Cache keyed by (userId, courseId) — `myRecommendedWeight2` is per-user.
const COURSE_INFO_CACHE = new Map<string, CurriculumEntry[]>();

/**
 * Pull the exercise list from Speediance's course curriculum (the authoritative
 * actionLibraryList for a courseId). We use `weightConfig=1` so per-user
 * personalised recommendations (`myRecommendedWeight2`) come back populated.
 *
 * Cached per (userId, courseId) — results don't typically change mid-deploy,
 * but `bestOneRepMax` does shift as the user progresses, so we don't share
 * across users.
 */
async function getCourseCurriculum(userId: string, courseId: number): Promise<CurriculumEntry[]> {
  const cacheKey = `${userId}::${courseId}`;
  const cached = COURSE_INFO_CACHE.get(cacheKey);
  if (cached) return cached;
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) return [];
  try {
    // Use the public client method so `this` stays bound — pulling `.req` off
    // and calling it bare loses the SpeedianceClient receiver and trips on
    // `this.url(...)` inside the helper.
    const info = (await client.getCourseDetail(courseId)) as Record<string, unknown>;
    const list = Array.isArray(info?.actionLibraryList)
      ? (info.actionLibraryList as Array<Record<string, unknown>>)
      : [];
    const out = list
      .map((e): CurriculumEntry | null => {
        // CRITICAL: use `groupId` (= actionLibraryGroupId), NOT `id`.
        //
        // Speediance's course-info response gives every exercise both an
        // `id` (variant/relation id — e.g. 246 for Barbell Deadlift in this
        // course's recommended config) AND a `groupId` (the action-library
        // group id — 455 — shared across courses for the same exercise).
        // Our sync writes Set rows keyed by `actionLibraryGroupId` from the
        // detail endpoints, so the curriculum must report `groupId` if we
        // want the lifetime-history lookup to find anything.
        const id = Number(e.groupId);
        const title = String(e.title ?? '');
        if (!Number.isFinite(id) || !title) return null;
        // Prefer `myRecommendedWeight2` (per-user personalised) over `weight`
        // (course default) over top-level `recommendedWeight`. Both string-list
        // fields are comma-separated decimals like "220,220,220,220".
        const personalised = parseCsv(e.myRecommendedWeight2);
        const planned = parseCsv(e.weight);
        const weights = personalised.length > 0 ? personalised : planned;
        const reps = parseCsv(e.setsAndReps);
        return {
          id,
          title,
          plannedReps: reps.length > 0 ? reps : undefined,
          plannedWeights: weights.length > 0 ? weights : undefined,
          speedianceRecommendedWeight: numOrUndef(e.recommendedWeight),
          bestOneRepMax: numOrUndef(e.bestOneRepMax),
          breakSeconds: numOrUndef(e.breakTime),
          isUnilateral: e.isLeftRight === 1,
        };
      })
      .filter((e): e is CurriculumEntry => e !== null);
    COURSE_INFO_CACHE.set(cacheKey, out);
    return out;
  } catch {
    return [];
  }
}

function parseCsv(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  const out: number[] = [];
  for (const part of value.split(',')) {
    const n = Number(part);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function numOrUndef(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Build a recommendation table for the user's next workout.
 *
 * Default behaviour: pull the next scheduled workout from Speediance's
 * calendar API. For each exercise in that workout's curriculum, look up
 * the user's MOST RECENT set across ALL prior sessions (any workout) to
 * derive a "last weight" and a progression suggestion. This is much more
 * useful than projecting last-workout-of-same-title because the user's
 * heaviest data for a given lift may live in a totally different course.
 *
 * If a preferredTitle is passed via querystring, we honour it: either it
 * matches a scheduled item ("Upcoming: …") or a past workout title.
 */
export async function loadNextWorkoutPlan(
  userId: string,
  preferredTitle?: string,
): Promise<{ plan: NextWorkoutPlan | null; options: WorkoutOption[] } | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const me = createDb({ tableName }).forUser(userId);

  const [allWorkouts, exercisesRes, allSetsRes, scheduled] = await Promise.all([
    loadAllWorkouts(userId),
    me.exercises.list() as Promise<{ data: ExerciseSummary[] }>,
    me.sets.listAll() as Promise<{ data: ExerciseSet[] }>,
    loadNextScheduledWorkout(userId),
  ]);

  const workouts = allWorkouts
    .filter((w) => !(w.isCardio || w.speedianceTrainingType === 'cardio'))
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1));

  // Build option list: scheduled item up top (if any), then distinct prior
  // workout titles sorted by recency.
  const options: WorkoutOption[] = [];
  if (scheduled?.title) {
    options.push({
      value: `scheduled:${scheduled.date}`,
      label: `Next up: ${scheduled.title} (${shortDate(scheduled.date)})`,
      scheduled: true,
      scheduledDate: scheduled.date,
    });
  }
  const seen = new Set<string>();
  for (const w of workouts) {
    if (!w.title || seen.has(w.title)) continue;
    seen.add(w.title);
    const count = workouts.filter((x) => x.title === w.title).length;
    options.push({
      value: w.title,
      label: `${w.title} (${count}×, last ${shortDate(w.startTime)})`,
      count,
      lastDone: w.startTime,
    });
  }

  // Pre-index by-exercise sets across the user's lifetime: for each
  // exerciseId, the most recent set with non-zero weight wins.
  type LifetimeSet = {
    startTime: string;
    weight: number;
    finishedReps?: number;
    targetReps?: number;
    formFlags?: string[];
  };
  const lifetimeByExercise = new Map<string, LifetimeSet>();
  for (const s of allSetsRes.data ?? []) {
    if (!s.weight || s.weight <= 0) continue;
    const cur = lifetimeByExercise.get(s.exerciseId);
    if (!cur || s.startTime > cur.startTime) {
      lifetimeByExercise.set(s.exerciseId, {
        startTime: s.startTime,
        weight: s.weight,
        finishedReps: s.finishedReps,
        targetReps: s.targetReps,
        formFlags: s.formFlags,
      });
    }
  }
  const exById = new Map((exercisesRes.data ?? []).map((e) => [e.exerciseId, e]));

  // Resolve the active source: scheduled (preferred) → matching past
  // session by title → most recent past session.
  type Source = {
    kind: 'scheduled' | 'completed';
    date: string;
    title?: string;
    courseId?: number;
  };
  let source: Source | null = null;
  if (preferredTitle?.startsWith('scheduled:') && scheduled) {
    source = {
      kind: 'scheduled',
      date: scheduled.date,
      title: scheduled.title,
      courseId: scheduled.courseId,
    };
  } else if (preferredTitle) {
    const matching = workouts.find((w) => w.title === preferredTitle);
    if (matching) {
      source = {
        kind: 'completed',
        date: matching.startTime,
        title: matching.title,
        courseId: matching.courseId,
      };
    }
  }
  if (!source) {
    // No preferred title. Default to the next scheduled workout when one
    // exists. We deliberately do NOT fall back to the most-recent completed
    // workout here — surfacing a past session as "Next session" is more
    // confusing than helpful (Jeff's call). When there's no upcoming work
    // on the calendar, the card shows an empty state instead.
    if (scheduled) {
      source = {
        kind: 'scheduled',
        date: scheduled.date,
        title: scheduled.title,
        courseId: scheduled.courseId,
      };
    }
  }
  if (!source) return { plan: null, options };

  // Resolve the exercise list for the source:
  //   - Prefer course curriculum for the scheduled / matched courseId
  //     (correct, ordered, with Speediance's own prescribed weights + reps +
  //     1RM regardless of whether we have prior detail in our DB).
  //   - Fall back to the previously-stored set rows from a matching past
  //     session (good for custom templates without a course).
  let curriculum: CurriculumEntry[] = [];
  if (source.courseId) {
    curriculum = await getCourseCurriculum(userId, source.courseId);
  }
  // Find the most-recent past session of the SAME course (or title) so we
  // can also report "this was the last time you did this workout".
  const lastCompleted: DashboardWorkout | null =
    workouts.find((w) =>
      source!.courseId !== undefined ? w.courseId === source!.courseId : w.title === source!.title,
    ) ?? null;

  if (curriculum.length === 0 && lastCompleted) {
    // Fall back: use whatever exercises we synced for the most-recent
    // completed session.
    const lastSets = (await me.sets.forWorkout(lastCompleted.startTime)) as {
      data: ExerciseSet[];
    };
    const order: string[] = [];
    const named = new Map<string, string>();
    for (const s of lastSets.data ?? []) {
      if (!order.includes(s.exerciseId)) {
        order.push(s.exerciseId);
        named.set(s.exerciseId, exById.get(s.exerciseId)?.name ?? `Exercise ${s.exerciseId}`);
      }
    }
    curriculum = order.map((id) => ({ id: Number(id), title: named.get(id) ?? `Exercise ${id}` }));
  }

  const lifts: PlannedLift[] = curriculum.map((entry) =>
    buildLift(entry, exById, lifetimeByExercise),
  );

  return {
    plan: {
      source: {
        kind: source.kind,
        date: source.date,
        title: source.title,
      },
      lastCompleted,
      lifts,
      title: source.title,
    },
    options,
  };
}

function recommend(opts: {
  lastWeight: number;
  hitAllTarget: boolean;
  flagged: boolean;
  isolation: boolean;
  /** True when `lastWeight` is from the user's lifetime history; false when
   *  it's the Speediance prescription. We only do the progression-bump path
   *  when it's real history. Otherwise we just echo the plan. */
  fromLifetime: boolean;
}): { weight: number; note: string } | null {
  if (opts.lastWeight <= 0) return null;
  if (!opts.fromLifetime) {
    return { weight: opts.lastWeight, note: 'Speediance plan — no log yet' };
  }
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

function shortDate(iso: string): string {
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${m} ${d.getUTCDate()}`;
}

// Keep `ScheduledItem` re-export for callers that imported it through this
// module (next-session-card etc.). Unused locally is fine.
export type { ScheduledItem };

/**
 * Like `loadNextWorkoutPlan` but pinned to one specific calendar date.
 * Returns one plan per scheduled item on that day. Used by /scheduled/[date].
 */
export async function loadScheduledDayPlans(
  userId: string,
  date: string,
): Promise<{ date: string; plans: NextWorkoutPlan[] } | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const me = createDb({ tableName }).forUser(userId);

  const [allWorkouts, exercisesRes, allSetsRes, scheduled] = await Promise.all([
    loadAllWorkouts(userId),
    me.exercises.list() as Promise<{ data: ExerciseSummary[] }>,
    me.sets.listAll() as Promise<{ data: ExerciseSet[] }>,
    loadScheduledWorkouts(userId),
  ]);
  const onDay = scheduled.filter((s) => s.date === date);
  if (onDay.length === 0) return { date, plans: [] };

  // Same lifetime-by-exerciseId pre-index as the main loader.
  type LifetimeSet = {
    startTime: string;
    weight: number;
    finishedReps?: number;
    targetReps?: number;
    formFlags?: string[];
  };
  const lifetimeByExercise = new Map<string, LifetimeSet>();
  for (const s of allSetsRes.data ?? []) {
    if (!s.weight || s.weight <= 0) continue;
    const cur = lifetimeByExercise.get(s.exerciseId);
    if (!cur || s.startTime > cur.startTime) {
      lifetimeByExercise.set(s.exerciseId, {
        startTime: s.startTime,
        weight: s.weight,
        finishedReps: s.finishedReps,
        targetReps: s.targetReps,
        formFlags: s.formFlags,
      });
    }
  }
  const exById = new Map((exercisesRes.data ?? []).map((e) => [e.exerciseId, e]));
  const workouts = allWorkouts.filter(
    (w) => !(w.isCardio || w.speedianceTrainingType === 'cardio'),
  );

  const plans: NextWorkoutPlan[] = [];
  for (const item of onDay) {
    const courseId = item.courseId;
    if (courseId === undefined) continue;
    const curriculum = await getCourseCurriculum(userId, courseId);
    if (curriculum.length === 0) continue;
    const lastCompleted = workouts.find((w) => w.courseId === courseId) ?? null;
    const lifts: PlannedLift[] = curriculum.map((entry) =>
      buildLift(entry, exById, lifetimeByExercise),
    );
    plans.push({
      source: { kind: 'scheduled', date: item.date, title: item.title },
      lastCompleted,
      lifts,
      title: item.title,
    });
  }
  return { date, plans };
}

/** Shared lift-from-curriculum builder — used by both loaders. */
function buildLift(
  entry: CurriculumEntry,
  exById: Map<string, ExerciseSummary>,
  lifetimeByExercise: Map<
    string,
    {
      startTime: string;
      weight: number;
      finishedReps?: number;
      targetReps?: number;
      formFlags?: string[];
    }
  >,
): PlannedLift {
  const id = String(entry.id);
  const exMeta = exById.get(id);
  const lifetime = lifetimeByExercise.get(id);
  const hitAllTarget =
    !lifetime || !lifetime.targetReps || (lifetime.finishedReps ?? 0) >= (lifetime.targetReps ?? 0);
  const flagged = (lifetime?.formFlags?.length ?? 0) > 0;
  const isolation = detectIsolation(
    entry.title,
    Boolean(exMeta?.isUnilateral || entry.isUnilateral),
  );
  const planFirstWeight = entry.plannedWeights?.[0];
  const baseForReco = lifetime?.weight ?? planFirstWeight ?? entry.speedianceRecommendedWeight;
  let reco =
    baseForReco !== undefined
      ? recommend({
          lastWeight: baseForReco,
          hitAllTarget,
          flagged,
          isolation,
          fromLifetime: lifetime !== undefined,
        })
      : null;
  if (reco) {
    // Hard safety cap (§3.6): never let a recommendation exceed
    // min(1.05 × bestWt, 1.15 × workingWt). The heuristic above can only
    // bump by +5lb so normally this is a no-op, but it backstops the
    // path that consumes this for the AI coach as well.
    const capped = clampWeight(reco.weight, {
      bestWeight: exMeta?.bestWeight,
      workingWeight: exMeta?.workingWeight,
    });
    if (capped.capped) {
      reco = { weight: capped.weight, note: 'safety cap — at recent max' };
    }
  }
  return {
    exerciseId: id,
    name: entry.title,
    muscleGroup: exMeta?.muscleGroup,
    isUnilateral: exMeta?.isUnilateral || entry.isUnilateral,
    lastWeight: lifetime?.weight,
    lastReps: lifetime?.finishedReps,
    lastTargetReps: lifetime?.targetReps,
    lastFormFlags: lifetime?.formFlags,
    lastSessionDate: lifetime?.startTime,
    bestWeight: exMeta?.bestWeight,
    recommendedWeight: reco?.weight,
    recommendNote: reco?.note,
    plannedReps: entry.plannedReps,
    plannedWeights: entry.plannedWeights,
    speedianceRecommendedWeight: entry.speedianceRecommendedWeight,
    bestOneRepMax: entry.bestOneRepMax,
    breakSeconds: entry.breakSeconds,
  };
}
