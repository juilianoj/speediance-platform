'use server';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import type { ExecuteResult, ProposedAction } from './plan';
import { runTool } from './tools';

/**
 * Server action called from the drawer when the user clicks Approve.
 * Runs every queued action in order, accumulating per-step results.
 * Doesn't short-circuit on failure — the partial-success state is
 * useful to surface (e.g. 4/5 steps worked, last one failed).
 *
 * Lives in its own `'use server'` file because Next.js requires every
 * export of a `'use server'` module to be an async function. The
 * pure-helper side of plan-and-confirm (types, queueWriteTool) lives
 * in `plan.ts`.
 */
export async function executePlan(actions: ProposedAction[]): Promise<{
  ok: boolean;
  results: ExecuteResult[];
}> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) {
    return {
      ok: false,
      results: actions.map((a) => ({ id: a.id, ok: false, error: 'Sign in first.' })),
    };
  }

  const results: ExecuteResult[] = [];
  for (const action of actions) {
    try {
      const result = await runTool(claims.sub, action.tool, action.args);
      results.push({ id: action.id, ok: true, result });
    } catch (err) {
      results.push({
        id: action.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return { ok: allOk, results };
}
