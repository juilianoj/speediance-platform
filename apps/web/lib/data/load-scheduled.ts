import 'server-only';

import { cache } from 'react';

import { createSecretsStore } from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

/**
 * A scheduled (not-yet-completed) workout on a specific day. Pulled from
 * Speediance's program-aware calendar endpoint so it works even when the
 * user is in the middle of a multi-week plan that hasn't been published
 * to their personal calendar individually.
 */
export interface ScheduledItem {
  date: string; // YYYY-MM-DD
  title?: string;
  courseId?: number;
  templateCode?: string | number;
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
 * two. Uses `/api/app/trainingCalendar/month` (NOT the `v5/monthNew`
 * endpoint, which only returns historical completed days). The older
 * endpoint includes scheduled-but-not-done workouts from the user's
 * active exclusivePlan; `isFinish=0` marks the scheduled ones.
 */
export const loadScheduledWorkouts = cache(async (userId: string): Promise<ScheduledItem[]> => {
  const stage = process.env.SST_STAGE ?? 'dev';
  const secrets = createSecretsStore({ stage });
  const secret = await secrets.get(userId);
  if (!secret || !secret.token || !secret.appUserId) return [];

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

  const months = nextThreeMonths();
  const out: ScheduledItem[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const ym of months) {
    try {
      const days = (await client.getCalendarPlanned(ym)) as Array<Record<string, unknown>>;
      if (!Array.isArray(days)) continue;
      for (const day of days) {
        const date = typeof day.date === 'string' ? day.date : undefined;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        // Only future-or-today entries — yesterday's "scheduled" workout
        // is no longer interesting (and may already exist in our records).
        if (date < today) continue;
        const plans = Array.isArray(day.trainingPlanList)
          ? (day.trainingPlanList as Array<Record<string, unknown>>)
          : [];
        for (const p of plans) {
          // Skip ones that are already finished (isFinish === 1).
          if (p.isFinish === 1) continue;
          out.push({
            date,
            title: typeof p.title === 'string' ? p.title : undefined,
            courseId: typeof p.courseId === 'number' ? p.courseId : undefined,
            templateCode: (p.templateCode ?? p.code) as string | number | undefined,
            exclusivePlanId: typeof p.exclusivePlanId === 'number' ? p.exclusivePlanId : undefined,
            exclusivePlanName:
              typeof p.exclusivePlanName === 'string' ? p.exclusivePlanName : undefined,
            durationMinute: typeof p.durationMinute === 'number' ? p.durationMinute : undefined,
            sort: typeof p.sort === 'number' ? p.sort : undefined,
          });
        }
      }
    } catch {
      // Best-effort; skip month on error.
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
