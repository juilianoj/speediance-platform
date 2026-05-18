import 'server-only';

import { cookies } from 'next/headers';

/**
 * The user's IANA timezone is stashed in a cookie by `<UserTzCookie />`
 * (mounted in the root layout). Server components read it via the
 * helpers below so date-of-today comparisons aren't UTC-biased.
 *
 * Why this matters: every place we ask "what is today's date" using
 * `new Date().toISOString().slice(0, 10)` returns the UTC date. For a
 * user in EDT (UTC-4) at 8pm local, UTC is already tomorrow — and the
 * scheduled-workout filter `if (scheduledDate < today) continue` then
 * silently drops the workout they're about to start.
 *
 * First-visit fallback: when the cookie isn't set yet (very first
 * request from a new browser, or right after migrating this module),
 * we fall back to UTC. The client component refreshes the route on
 * mount once it has set the cookie, so the second render is correct.
 */

const TZ_COOKIE = 'spd-tz';

export async function getUserTimezone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  if (value && isValidIanaTz(value)) return value;
  return 'UTC';
}

export async function todayInUserTimezone(): Promise<string> {
  return dateInTimezone(new Date(), await getUserTimezone());
}

/** Format a Date as `YYYY-MM-DD` in the given IANA timezone. */
export function dateInTimezone(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

function isValidIanaTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
