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
 * two. Queries BOTH calendar endpoints and merges the results:
 *
 *   - `/api/app/v5/trainingCalendar/monthNew` — newer endpoint that
 *     surfaces both program-prescribed days AND user-scheduled custom
 *     templates (type: 3, isReservation: true). Includes finished
 *     entries too (we filter by `isFinish !== 1`).
 *   - `/api/app/trainingCalendar/month` — older endpoint that's the
 *     authoritative source for program-prescribed scheduled days
 *     (exclusivePlan curriculum). The monthNew endpoint has been
 *     observed to silently omit some program days for some accounts,
 *     so we layer the old endpoint on top as a safety net.
 *
 * Items are deduped by `(date, courseId|templateId|title)`. If either
 * endpoint errors the other still feeds the heatmap — best-effort.
 */
export const loadScheduledWorkouts = cache(async (userId: string): Promise<ScheduledItem[]> => {
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) {
    console.warn('[scheduled] no Speediance client for user', userId);
    return [];
  }

  const months = nextThreeMonths();
  const today = new Date().toISOString().slice(0, 10);

  // Run both endpoints in parallel across all months. Each is a ~300-800ms
  // Speediance round-trip; settled-promise so a single 5xx/timeout doesn't
  // wipe out the others.
  const calls = months.flatMap((ym) => [
    {
      endpoint: 'monthNew' as const,
      ym,
      promise: client.getCalendarMonth(ym) as Promise<Array<Record<string, unknown>>>,
    },
    {
      endpoint: 'month' as const,
      ym,
      promise: client.getCalendarPlanned(ym) as Promise<Array<Record<string, unknown>>>,
    },
  ]);
  const settled = await Promise.allSettled(calls.map((c) => c.promise));

  const collected: ScheduledItem[] = [];
  type EndpointKey = 'monthNew' | 'month';
  type Stat = { ok: number; err: number; items: number };
  const stats: Record<EndpointKey, Stat> = {
    monthNew: { ok: 0, err: 0, items: 0 },
    month: { ok: 0, err: 0, items: 0 },
  };
  settled.forEach((result, idx) => {
    const call = calls[idx];
    if (!call) return;
    const { endpoint, ym } = call;
    if (result.status !== 'fulfilled') {
      stats[endpoint].err++;
      console.warn(
        `[scheduled] ${endpoint} ${ym} failed for user ${userId}:`,
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
      return;
    }
    stats[endpoint].ok++;
    const days = result.value;
    if (!Array.isArray(days)) return;
    for (const day of days) {
      const date = typeof day.date === 'string' ? day.date : undefined;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < today) continue;
      const plans = Array.isArray(day.trainingPlanList)
        ? (day.trainingPlanList as Array<Record<string, unknown>>)
        : [];
      for (const p of plans) {
        if (p.isFinish === 1) continue;
        const isTemplate =
          p.isReservation === true ||
          typeof p.templateId === 'number' ||
          typeof p.templateReservationId === 'number';
        collected.push({
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
        stats[endpoint].items++;
      }
    }
  });

  // Dedupe across the two endpoints. Same scheduled day will appear in
  // both for course-driven items; key by date + the strongest identifier
  // available (courseId beats templateId beats title).
  const seen = new Map<string, ScheduledItem>();
  for (const item of collected) {
    const key =
      item.courseId !== undefined
        ? `${item.date}|c:${item.courseId}`
        : item.templateId !== undefined
          ? `${item.date}|t:${item.templateId}`
          : item.templateCode !== undefined
            ? `${item.date}|tc:${item.templateCode}`
            : `${item.date}|n:${item.title ?? '?'}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      // Merge: prefer fields with values over undefined so we get the
      // most complete record from whichever endpoint had it.
      seen.set(key, {
        ...existing,
        title: existing.title ?? item.title,
        courseId: existing.courseId ?? item.courseId,
        templateId: existing.templateId ?? item.templateId,
        templateCode: existing.templateCode ?? item.templateCode,
        exclusivePlanId: existing.exclusivePlanId ?? item.exclusivePlanId,
        exclusivePlanName: existing.exclusivePlanName ?? item.exclusivePlanName,
        durationMinute: existing.durationMinute ?? item.durationMinute,
        sort: existing.sort ?? item.sort,
      });
    }
  }

  const out = Array.from(seen.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.sort ?? 0) - (b.sort ?? 0);
  });

  console.info(
    `[scheduled] user=${userId} months=${months.length} monthNew=${stats.monthNew.ok}/${calls.length / 2} (items=${stats.monthNew.items}) month=${stats.month.ok}/${calls.length / 2} (items=${stats.month.items}) merged=${out.length}`,
  );

  return out;
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
