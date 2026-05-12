import 'server-only';

import { createSecretsStore } from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

import { createDb } from '@speediance/db';

import type { DashboardWorkout } from '@/app/dashboard/load-dashboard';

import type { ExerciseSet, ExerciseSummary } from './load-exercises';
import { loadNextScheduledWorkout, type ScheduledItem } from './load-scheduled';
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

const COURSE_INFO_CACHE = new Map<number, Array<{ id: number; title: string }>>();

/**
 * Pull the exercise list from Speediance's course curriculum (the authoritative
 * actionLibraryList for a courseId). Cached per-process; results don't change
 * mid-deploy.
 */
async function getCourseCurriculum(
  userId: string,
  courseId: number,
): Promise<Array<{ id: number; title: string }>> {
  const cached = COURSE_INFO_CACHE.get(courseId);
  if (cached) return cached;
  const stage = process.env.SST_STAGE ?? 'dev';
  const secret = await createSecretsStore({ stage }).get(userId);
  if (!secret?.token || !secret.appUserId) return [];
  const creds: Credentials = {
    userId: secret.appUserId,
    token: secret.token,
    region: secret.region,
    unit: 0,
    deviceType: secret.deviceType,
    allowMonsterMoves: secret.allowMonsterMoves,
  };
  const client = new SpeedianceClient(creds, {
    region: secret.region,
    deviceType: secret.deviceType,
    allowMonsterMoves: secret.allowMonsterMoves,
  });
  try {
    const r = (client as unknown as { req: <T>(m: string, p: string) => Promise<T> }).req;
    const info = await r<Record<string, unknown>>(
      'GET',
      `/api/app/v2/course/info/${courseId}?weightConfig=1`,
    );
    const list = Array.isArray(info?.actionLibraryList)
      ? (info.actionLibraryList as Array<Record<string, unknown>>)
      : [];
    const out = list
      .map((e) => ({ id: Number(e.id), title: String(e.title ?? '') }))
      .filter((e) => Number.isFinite(e.id) && e.title);
    COURSE_INFO_CACHE.set(courseId, out);
    return out;
  } catch {
    return [];
  }
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
    // No preferred; default to scheduled if available, else most recent.
    if (scheduled) {
      source = {
        kind: 'scheduled',
        date: scheduled.date,
        title: scheduled.title,
        courseId: scheduled.courseId,
      };
    } else if (workouts[0]) {
      source = {
        kind: 'completed',
        date: workouts[0].startTime,
        title: workouts[0].title,
        courseId: workouts[0].courseId,
      };
    }
  }
  if (!source) return { plan: null, options };

  // Resolve the exercise list for the source:
  //   - Prefer course curriculum for the scheduled / matched courseId
  //     (correct, ordered, regardless of prior detail availability).
  //   - Fall back to the previously-stored set rows from a matching past
  //     session (good for custom templates without a course).
  let curriculum: Array<{ id: string; name: string }> = [];
  if (source.courseId) {
    const c = await getCourseCurriculum(userId, source.courseId);
    curriculum = c.map((e) => ({ id: String(e.id), name: e.title }));
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
    curriculum = order.map((id) => ({ id, name: named.get(id) ?? `Exercise ${id}` }));
  }

  const lifts: PlannedLift[] = curriculum.map(({ id, name }) => {
    const exMeta = exById.get(id);
    const lifetime = lifetimeByExercise.get(id);
    const hitAllTarget =
      !lifetime ||
      !lifetime.targetReps ||
      (lifetime.finishedReps ?? 0) >= (lifetime.targetReps ?? 0);
    const flagged = (lifetime?.formFlags?.length ?? 0) > 0;
    const isolation = detectIsolation(name, Boolean(exMeta?.isUnilateral));
    const reco = lifetime
      ? recommend({ lastWeight: lifetime.weight, hitAllTarget, flagged, isolation })
      : null;
    return {
      exerciseId: id,
      name,
      muscleGroup: exMeta?.muscleGroup,
      isUnilateral: exMeta?.isUnilateral,
      lastWeight: lifetime?.weight,
      lastReps: lifetime?.finishedReps,
      lastTargetReps: lifetime?.targetReps,
      lastFormFlags: lifetime?.formFlags,
      lastSessionDate: lifetime?.startTime,
      bestWeight: exMeta?.bestWeight,
      recommendedWeight: reco?.weight,
      recommendNote: reco?.note,
    };
  });

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
