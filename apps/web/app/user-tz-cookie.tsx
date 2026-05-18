'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Writes the browser's IANA timezone to a `spd-tz` cookie so server
 * components can compute the user's "today" correctly. Mounted once in
 * the root layout. On the very first visit after this lands, the cookie
 * isn't set yet — once we set it we call `router.refresh()` so server
 * components re-render with the correct timezone. On subsequent visits
 * the effect is a no-op because the cookie already matches.
 *
 * Maxes out the cookie lifetime at 1 year (same pattern as the theme
 * cookie). SameSite=Lax keeps it from leaking across origins.
 */
export function UserTzCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.match(/(?:^|;\s*)spd-tz=([^;]+)/)?.[1];
    const decoded = current ? decodeURIComponent(current) : null;
    if (decoded === tz) return;
    document.cookie = `spd-tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
    // Only refresh when transitioning from "no cookie" to "cookie set" —
    // a router.refresh on every TZ change would loop forever, and a tz
    // change mid-session is rare enough to skip.
    if (!decoded) router.refresh();
  }, [router]);
  return null;
}
