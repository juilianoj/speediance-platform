import type { ScheduledItem } from './load-scheduled';

/**
 * Pure title-keyword heuristic for the §3.3 recovery detector — kept
 * separate from `load-recovery-warnings.ts` so unit tests don't pull in
 * the `server-only` import chain (and so a future MCP / cron caller can
 * reuse it without paying the same cost).
 *
 * Match is substring + case-insensitive — "Yoga Flow" hits on "yoga",
 * "Hip Mobility — full body" hits on "mobility". Keep the keyword list
 * tight so a genuine lift workout named "Recovery Push Day" still gets
 * flagged: we deliberately don't match on "recovery" alone for that
 * reason.
 */

const MOBILITY_KEYWORDS = [
  'yoga',
  'mobility',
  'stretch',
  'foam roll',
  'meditation',
  'breathwork',
  'cooldown',
  'cool down',
  'flexibility',
  'pilates',
  'rehab',
];

export function isMobilityScheduledItem(item: ScheduledItem): boolean {
  const title = (item.title ?? '').toLowerCase();
  if (!title) return false;
  return MOBILITY_KEYWORDS.some((kw) => title.includes(kw));
}
