import 'server-only';

import { cache } from 'react';

import { createSecretsStore } from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

/**
 * Scheduled-workout item returned by Speediance's calendar API for a
 * specific date. The API doesn't have a documented schema; we extract a
 * handful of likely-named fields defensively so the dashboard can show
 * the user's actual upcoming workout (not just "something is scheduled").
 */
export interface ScheduledItem {
  date: string; // YYYY-MM-DD
  title?: string;
  courseId?: number;
  templateCode?: string | number;
}

/**
 * Pull Speediance's training calendar for this month + the next two.
 * Returns a list of scheduled items per upcoming date. Best-effort: any
 * failure (expired token, schema drift) yields an empty list so callers
 * can render without scheduled overlays.
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
  const items: ScheduledItem[] = [];

  for (const ym of months) {
    try {
      const month = (await client.getCalendarMonth(ym)) as unknown;
      const days = Array.isArray(month)
        ? (month as Array<Record<string, unknown>>)
        : Array.isArray((month as { dayList?: unknown[] })?.dayList)
          ? (month as { dayList: Array<Record<string, unknown>> }).dayList
          : [];

      for (const day of days) {
        if (typeof day !== 'object' || day === null) continue;
        const d = day as Record<string, unknown>;
        const dateRaw = (d.date ?? d.day ?? d.thatDay ?? d.dateStr) as string | undefined;
        if (typeof dateRaw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) continue;
        const reservations = collectReservations(d);
        for (const r of reservations) {
          items.push({
            date: dateRaw,
            title: (r.courseTitle ?? r.title ?? r.name ?? r.templateName) as string | undefined,
            courseId: typeof r.courseId === 'number' ? (r.courseId as number) : undefined,
            templateCode: r.templateCode as string | number | undefined,
          });
        }
      }
    } catch {
      // Best-effort; skip month on error.
    }
  }
  return items;
});

/** Convenience wrapper used by the heatmap. */
export async function loadScheduledDates(userId: string): Promise<Set<string>> {
  const items = await loadScheduledWorkouts(userId);
  return new Set(items.map((i) => i.date));
}

/**
 * Find the next scheduled session strictly *after* today (inclusive of
 * today if there's a scheduled workout for today that hasn't been
 * completed). Returns null if nothing's scheduled in the lookahead.
 */
export async function loadNextScheduledWorkout(userId: string): Promise<ScheduledItem | null> {
  const items = await loadScheduledWorkouts(userId);
  if (items.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.find((i) => i.date >= today) ?? null;
}

function collectReservations(day: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [day.reservationList, day.templateList, day.list, day.items];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c.filter((x) => typeof x === 'object' && x !== null) as Array<Record<string, unknown>>;
    }
  }
  // No reservation list found — emit a single placeholder so the date is
  // still flagged as "scheduled" without a title.
  return [{}];
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
