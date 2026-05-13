import 'server-only';

import { loadScheduledWorkouts, type ScheduledItem } from './load-scheduled';
import { isMobilityScheduledItem } from './mobility-detection';

/**
 * Roadmap §3.3 — Recovery / stretch injector.
 *
 * Detects runs of 3+ consecutive days that are all scheduled with lift
 * (non-mobility) workouts in the user's upcoming calendar, and surfaces a
 * banner the user can act on with one click ("Create mobility draft").
 *
 * Mobility detection (v2): the Speediance API doesn't tag a course as
 * mobility/yoga first-class. We rely on a title-keyword heuristic
 * (`isMobilityScheduledItem`) — if the scheduled item's title contains
 * any of a small set of mobility / recovery terms, we don't count it as
 * a lift day. That's deliberately conservative; some mobility courses
 * with bare names like "Cooldown" or "Reset" may still slip through and
 * over-trigger the warning. A v3 could check `courseCategoryName` on a
 * past completed workout for the same `courseId`, which Speediance
 * categorizes more reliably.
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

  // Bucket scheduled items by date and check whether at least one item
  // on that day is a real lift (i.e. NOT mobility-tagged by title). A
  // day with only mobility entries doesn't add to the streak — and is
  // also a fine candidate for the streak-breaker, since the user
  // already gave themselves the recovery slot.
  const itemsByDate = new Map<string, ScheduledItem[]>();
  for (const item of scheduled) {
    const list = itemsByDate.get(item.date) ?? [];
    list.push(item);
    itemsByDate.set(item.date, list);
  }
  const liftDays = new Set<string>();
  for (const [date, items] of itemsByDate) {
    const hasLift = items.some((it) => !isMobilityScheduledItem(it));
    if (hasLift) liftDays.add(date);
  }

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
