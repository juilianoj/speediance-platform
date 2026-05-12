import 'server-only';

import { cache } from 'react';

import { createSecretsStore } from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

/**
 * Pull Speediance's training calendar for the current month + the next two,
 * extract scheduled dates. Returns a Set of YYYY-MM-DD strings.
 *
 * This is a non-cached real-time call into Speediance — kept off the
 * critical render path of the dashboard via `Promise.allSettled` upstream,
 * and gated by React `cache()` so concurrent renders in the same request
 * don't fan out. Caller treats failure as "no scheduled data".
 */
export const loadScheduledDates = cache(async (userId: string): Promise<Set<string>> => {
  const stage = process.env.SST_STAGE ?? 'dev';
  const secrets = createSecretsStore({ stage });
  const secret = await secrets.get(userId);
  if (!secret || !secret.token || !secret.appUserId) return new Set();

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
    // No onUnauthorized handler — if the token is expired we silently
    // skip; the next nightly sync will refresh it.
  });

  const months = nextThreeMonths();
  const dates = new Set<string>();
  for (const ym of months) {
    try {
      const month = (await client.getCalendarMonth(ym)) as
        | Array<Record<string, unknown>>
        | { dayList?: Array<Record<string, unknown>> }
        | null;
      const days = Array.isArray(month)
        ? month
        : Array.isArray(month?.dayList)
          ? month.dayList
          : [];
      for (const day of days) {
        if (typeof day !== 'object' || day === null) continue;
        const d = day as Record<string, unknown>;
        // The calendar response is undocumented; defensively try a few
        // common field names. We accept anything that decodes to a
        // YYYY-MM-DD date with at least one scheduled item.
        const raw = (d.date ?? d.day ?? d.thatDay ?? d.dateStr) as string | undefined;
        if (typeof raw !== 'string') continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue;
        const reservations = (d.reservationList ?? d.templateList ?? d.list) as unknown;
        const hasScheduled = Array.isArray(reservations)
          ? reservations.length > 0
          : Boolean(reservations);
        if (hasScheduled) dates.add(raw);
      }
    } catch {
      // ignore — calendar is best-effort; dashboard still renders
    }
  }
  return dates;
});

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
