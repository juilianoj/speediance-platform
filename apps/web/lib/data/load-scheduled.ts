import 'server-only';

import { cache } from 'react';

import { createRefreshingSpeedianceClient } from '@/lib/speediance/refreshing-client';

/**
 * A scheduled (not-yet-completed) workout on a specific day. Pulled from
 * Speediance's program-aware calendar endpoint so it works even when the
 * user is in the middle of a multi-week plan that hasn't been published
 * to their personal calendar individually.
 *
 * `type` discriminates how the entry was placed on the calendar:
 *   - `course` — program-prescribed (e.g. Sam-invite challenges). Has
 *     `courseId`, often `exclusivePlanId`.
 *   - `template` — user-scheduled a custom template (via our Builder or
 *     directly via the Speediance app). Has `templateId` / `code`.
 */
export interface ScheduledItem {
  date: string; // YYYY-MM-DD
  type: 'course' | 'template';
  title?: string;
  courseId?: number;
  templateId?: number;
  templateCode?: string;
  /** Speediance program (exclusivePlan) this scheduled day belongs to,
   *  when applicable — useful for the dashboard to label which program
   *  the user is mid-cycle on. */
  exclusivePlanId?: number;
  exclusivePlanName?: string;
  durationMinute?: number;
  sort?: number;
}

/**
 * Pull Speediance's training calendar for the current month + the next
 * two. Uses `/api/app/v5/trainingCalendar/monthNew` — verified via probe
 * that this is the endpoint surfacing BOTH program-prescribed days
 * (type: 2 / 6, exclusivePlan-driven) AND user-scheduled custom
 * templates (type: 3, isReservation: true). The older
 * `/trainingCalendar/month` only shows program-prescribed entries, so
 * custom-template reservations created by our Builder wouldn't show up
 * on the heatmap.
 */
export const loadScheduledWorkouts = cache(async (userId: string): Promise<ScheduledItem[]> => {
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) return [];

  const months = nextThreeMonths();
  const today = new Date().toISOString().slice(0, 10);

  // Three sequential `await client.getCalendarMonth(ym)` calls were the
  // bottleneck on first-login dashboard render — each is a ~300-800ms
  // Speediance round-trip and the loop waited on every one. Parallel
  // settled-promise call cuts the wall time to the slowest single month
  // (saving ~1-2s on the dashboard load).
  const settled = await Promise.allSettled(
    months.map((ym) => client.getCalendarMonth(ym) as Promise<Array<Record<string, unknown>>>),
  );

  const out: ScheduledItem[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const days = result.value;
    if (!Array.isArray(days)) continue;
    for (const day of days) {
      const date = typeof day.date === 'string' ? day.date : undefined;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < today) continue;
      const plans = Array.isArray(day.trainingPlanList)
        ? (day.trainingPlanList as Array<Record<string, unknown>>)
        : [];
      for (const p of plans) {
        // Skip finished entries (isFinish === 1). v5 monthNew includes
        // completed days too — we only want the upcoming ones for
        // scheduled-day UI.
        if (p.isFinish === 1) continue;
        const isTemplate =
          p.isReservation === true ||
          typeof p.templateId === 'number' ||
          typeof p.templateReservationId === 'number';
        out.push({
          date,
          type: isTemplate ? 'template' : 'course',
          title: typeof p.title === 'string' ? p.title : undefined,
          courseId: typeof p.courseId === 'number' ? p.courseId : undefined,
          templateId: typeof p.templateId === 'number' ? p.templateId : undefined,
          templateCode: typeof p.code === 'string' ? p.code : undefined,
          exclusivePlanId: typeof p.exclusivePlanId === 'number' ? p.exclusivePlanId : undefined,
          exclusivePlanName:
            typeof p.exclusivePlanName === 'string' ? p.exclusivePlanName : undefined,
          durationMinute: typeof p.durationMinute === 'number' ? p.durationMinute : undefined,
          sort: typeof p.sort === 'number' ? p.sort : undefined,
        });
      }
    }
  }
  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.sort ?? 0) - (b.sort ?? 0);
  });
});

/** Convenience wrapper used by the heatmap. */
export async function loadScheduledDates(userId: string): Promise<Set<string>> {
  const items = await loadScheduledWorkouts(userId);
  return new Set(items.map((i) => i.date));
}

/**
 * Find the next scheduled workout at-or-after today. Sorted by
 * (date, sort), so the first item is the "next thing on the calendar".
 */
export async function loadNextScheduledWorkout(userId: string): Promise<ScheduledItem | null> {
  const items = await loadScheduledWorkouts(userId);
  return items[0] ?? null;
}

function nextThreeMonths(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 3; i++) {
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push(ym);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
