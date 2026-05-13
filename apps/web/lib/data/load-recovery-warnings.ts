import 'server-only';

import { loadScheduledWorkouts } from './load-scheduled';

/**
 * Roadmap §3.3 — Recovery / stretch injector.
 *
 * Detects runs of 3+ consecutive days that are all scheduled with lift
 * (non-cardio) workouts in the user's upcoming calendar, and surfaces a
 * banner the user can act on with one click ("Create mobility draft").
 *
 * Heuristic (intentional v1): "lift day" = at least one non-cardio
 * scheduled item on that calendar day. The Speediance API doesn't tag
 * a workout as mobility/yoga first-class — the catalog has a
 * `muscleGroup` per exercise but no top-level "this whole course is a
 * recovery course." So mobility courses scheduled by the user will be
 * mis-classified as lift days. That's the deliberate v1 trade-off: we'd
 * rather over-warn than miss the case the roadmap names. A v2 can lean
 * on the course catalog once we tag mobility courses.
 *
 * Scoped to a 14-day horizon so the dashboard doesn't badger the user
 * about a hypothetical 3-day block six weeks out.
 */

export interface RecoveryWarning {
  /** First day of the consecutive run (YYYY-MM-DD). */
  startDate: string;
  /** Last day of the consecutive run (YYYY-MM-DD). */
  endDate: string;
  /** Number of consecutive lift days, inclusive. */
  count: number;
  /** Suggested mobility insertion date — the day AFTER the run, or the
   *  middle of the run if there's a rest day in between we could use. */
  suggestedInsertDate: string;
}

const HORIZON_DAYS = 14;
const MIN_CONSECUTIVE = 3;

/**
 * Returns zero or more upcoming lift-day blocks of length ≥ 3 in the
 * next two weeks. Empty array on a calm calendar.
 */
export async function loadRecoveryWarnings(userId: string): Promise<RecoveryWarning[]> {
  const scheduled = await loadScheduledWorkouts(userId);
  if (scheduled.length === 0) return [];

  // Build a set of YYYY-MM-DD strings that have at least one non-cardio
  // scheduled item. We don't actually know whether a course is cardio
  // from the calendar item shape (cardio surfaces in completed-workout
  // metadata, not in scheduled prescriptions), so we treat every
  // scheduled day as a lift day for v1. This is the deliberate
  // over-warn trade-off documented at the top of the file.
  const liftDays = new Set<string>();
  for (const item of scheduled) liftDays.add(item.date);

  const today = todayIso();
  const horizon = addDaysIso(today, HORIZON_DAYS);

  // Walk forward day-by-day, counting consecutive lift days. When the
  // streak breaks (or we run off the horizon), emit a warning if the
  // streak hit threshold.
  const warnings: RecoveryWarning[] = [];
  let runStart: string | null = null;
  let runLength = 0;
  for (let day = today; day <= horizon; day = addDaysIso(day, 1)) {
    if (liftDays.has(day)) {
      if (runStart === null) runStart = day;
      runLength += 1;
    } else {
      if (runLength >= MIN_CONSECUTIVE && runStart) {
        warnings.push(buildWarning(runStart, runLength, day));
      }
      runStart = null;
      runLength = 0;
    }
  }
  // Emit a trailing warning if the run was still in progress at the
  // horizon edge — the user has 3+ scheduled but we haven't seen the
  // rest day yet.
  if (runLength >= MIN_CONSECUTIVE && runStart) {
    warnings.push(buildWarning(runStart, runLength, addDaysIso(horizon, 1)));
  }

  return warnings;
}

function buildWarning(startDate: string, count: number, nextNonLiftDay: string): RecoveryWarning {
  const endDate = addDaysIso(startDate, count - 1);
  // Insert the mobility session on the first non-lift day after the
  // run — that's the natural rest slot the user already has open. If
  // the run pushes past the horizon, fall back to the day after the
  // last lift day.
  return {
    startDate,
    endDate,
    count,
    suggestedInsertDate: nextNonLiftDay,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
