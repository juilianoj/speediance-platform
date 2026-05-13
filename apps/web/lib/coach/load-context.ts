import 'server-only';

import { createDb } from '@speediance/db';

import { loadProfile, type CoachPrefs } from '@/app/profile/load-profile';

interface ActiveMemory {
  category?: string;
  text: string;
  createdAt: string;
}

export interface CoachContext {
  coachPrefs: CoachPrefs | null;
  activeMemories: ActiveMemory[];
}

const MAX_MEMORIES = 5;

/**
 * Persistent context the AI Coach sees on every call: structured prefs from
 * the Profile row + the most-recent active rows from the `memory` entity.
 * Bounded (≤ ~200 tokens) so the system-prompt overhead stays predictable.
 * Returns gracefully on missing infra so the coach still works during local
 * dev with an unset DYNAMO_TABLE_NAME.
 */
export async function loadCoachContext(userId: string): Promise<CoachContext> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { coachPrefs: null, activeMemories: [] };

  const [profile, memoriesResult] = await Promise.all([
    loadProfile(userId),
    (async () => {
      try {
        const db = createDb({ tableName });
        const me = db.forUser(userId);
        return (await me.memories.list()) as {
          data: Array<{ category?: string; text: string; createdAt: string; active?: boolean }>;
        };
      } catch (err) {
        console.warn('loadCoachContext: memories.list failed', err);
        return { data: [] };
      }
    })(),
  ]);

  const coachPrefs = profile?.coachPrefs ?? null;

  const activeMemories = (memoriesResult.data ?? [])
    .filter((m) => m.active !== false && typeof m.text === 'string' && m.text.length > 0)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_MEMORIES)
    .map(({ category, text, createdAt }) => ({ category, text, createdAt }));

  return { coachPrefs, activeMemories };
}

/**
 * Render the loaded context into the trailing block of the system prompt.
 * Returns an empty string when there's nothing to add so the coach's
 * baseline prompt stays clean for fresh users.
 */
export function renderCoachContextBlock(ctx: CoachContext): string {
  const lines: string[] = [];
  const prefs = ctx.coachPrefs;
  const hasPrefs =
    prefs &&
    (prefs.primaryGoal ||
      prefs.sessionsPerWeek ||
      prefs.sessionMinutes ||
      prefs.equipmentConstraints);

  if (hasPrefs) {
    lines.push('### About this user');
    if (prefs?.primaryGoal) lines.push(`Primary goal: ${prefs.primaryGoal}.`);
    if (prefs?.sessionsPerWeek) lines.push(`Trains ${prefs.sessionsPerWeek}× per week.`);
    if (prefs?.sessionMinutes)
      lines.push(`Typical session length: ${prefs.sessionMinutes} minutes.`);
    if (prefs?.equipmentConstraints) lines.push(`Constraints: ${prefs.equipmentConstraints}`);
  }

  if (ctx.activeMemories.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### Coach memories');
    for (const m of ctx.activeMemories) {
      const tag = m.category ? `[${m.category}] ` : '';
      lines.push(`- ${tag}${m.text}`);
    }
  }

  return lines.join('\n');
}
