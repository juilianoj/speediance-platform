import { randomUUID } from 'crypto';

import type { ToolName } from './tools';

/**
 * Roadmap §β — plan-and-confirm flow for the agentic assistant.
 *
 * Write tools the agent decides to call don't execute inline anymore.
 * Instead they get queued as `ProposedAction`s and surfaced to the user
 * as a plan card with one Approve / Cancel button. Approve fires
 * `executePlan` (in `plan-actions.ts`) which runs every queued tool in
 * order. Cancel drops the queue and nothing touches DDB / Speediance.
 *
 * Read tools (history queries, catalog searches) still execute inline
 * during the chat loop — the agent needs real data to reason. Only
 * mutating actions are deferred.
 *
 * This file is NOT a `'use server'` module: it exports pure helpers
 * (the set of write-tool names, the queueWriteTool synchronous helper,
 * and the ProposedAction type). The server action `executePlan` lives
 * in `plan-actions.ts` because `'use server'` files can only export
 * async functions.
 */

export const WRITE_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'propose_workout',
  'create_workout_draft',
  'update_workout_draft',
  'create_program_draft',
  'update_program_draft',
  'schedule_program',
  'unschedule_program',
  'push_draft_to_speediance',
  'unsave_draft_from_speediance',
]);

export interface ProposedAction {
  /** Stable id used as the React key + as the way the client refers
   *  back to a specific step when reporting results. */
  id: string;
  tool: ToolName;
  /** Args we'll actually pass to `runTool` at execute time. For
   *  create_workout_draft / create_program_draft we pre-fill the
   *  generated id here so a later queued step can reference it. */
  args: Record<string, unknown>;
  /** Human-readable description shown in the plan card. */
  summary: string;
}

/**
 * Called by `askCoach` whenever the model invokes a write tool. Adds
 * the action to the queue (mutated by the caller) and returns a
 * synthetic tool result the model can keep reasoning against. For
 * create-style tools we generate the new entity id NOW so the model
 * can chain (e.g. create_workout_draft → create_program_draft that
 * references the freshly minted draftId).
 *
 * Returned value is what the model "sees" as the tool result — the
 * structure mirrors the real tool's response so the model's
 * downstream reasoning works the same.
 */
export function queueWriteTool(
  name: ToolName,
  args: Record<string, unknown>,
  queue: ProposedAction[],
): unknown {
  const id = randomUUID();

  switch (name) {
    case 'create_workout_draft': {
      const draftId = newShortId();
      const enrichedArgs = { ...args, draftId };
      const exerciseCount = Array.isArray(args.exercises) ? args.exercises.length : 0;
      const summary = `Create workout draft "${
        typeof args.name === 'string' ? args.name : 'Coach-built workout'
      }" (${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'})`;
      queue.push({ id, tool: name, args: enrichedArgs, summary });
      return {
        ok: true,
        queued: true,
        draftId,
        builderUrl: `/builder/${draftId}`,
        message: 'Queued — will be created after the user approves the plan.',
      };
    }

    case 'update_workout_draft': {
      const draftId = String(args.draftId ?? '');
      if (!draftId) return { error: 'draftId is required' };
      const summary = `Update workout draft ${draftId}`;
      queue.push({ id, tool: name, args, summary });
      return {
        ok: true,
        queued: true,
        draftId,
        message: 'Queued — update applies after approval.',
      };
    }

    case 'create_program_draft': {
      const programId = newShortId();
      const enrichedArgs = { ...args, programId };
      const weekCount = typeof args.weekCount === 'number' ? args.weekCount : 0;
      const slotCount = Array.isArray(args.slots) ? args.slots.length : 0;
      const summary = `Create program "${
        typeof args.name === 'string' ? args.name : 'Coach-built program'
      }" (${weekCount}-week, ${slotCount} slot${slotCount === 1 ? '' : 's'})`;
      queue.push({ id, tool: name, args: enrichedArgs, summary });
      return {
        ok: true,
        queued: true,
        programId,
        builderUrl: `/builder/programs/${programId}`,
        message: 'Queued — program saves after approval.',
      };
    }

    case 'update_program_draft': {
      const programId = String(args.programId ?? '');
      if (!programId) return { error: 'programId is required' };
      const summary = `Update program ${programId}`;
      queue.push({ id, tool: name, args, summary });
      return {
        ok: true,
        queued: true,
        programId,
        message: 'Queued — update applies after approval.',
      };
    }

    case 'schedule_program': {
      const programId = String(args.programId ?? '');
      const startDate = String(args.startDate ?? '');
      if (!programId || !startDate) {
        return { error: 'programId and startDate are required' };
      }
      const summary = `Schedule program ${programId} on the Speediance calendar starting ${startDate}`;
      queue.push({ id, tool: name, args, summary });
      return {
        ok: true,
        queued: true,
        message: 'Queued — Speediance push happens after approval.',
      };
    }

    case 'unschedule_program': {
      const programId = String(args.programId ?? '');
      if (!programId) return { error: 'programId is required' };
      const summary = `Remove program ${programId} reservations from the Speediance calendar`;
      queue.push({ id, tool: name, args, summary });
      return {
        ok: true,
        queued: true,
        message: 'Queued — Speediance call happens after approval.',
      };
    }

    case 'propose_workout': {
      const summary = `Save proposed workout "${
        typeof args.name === 'string' ? args.name : 'Coach proposal'
      }" to the programs list (legacy path)`;
      queue.push({ id, tool: name, args, summary });
      return { ok: true, queued: true, message: 'Queued — saved after approval.' };
    }

    case 'push_draft_to_speediance': {
      const draftId = String(args.draftId ?? '');
      if (!draftId) return { error: 'draftId is required' };
      const summary = `Push workout draft ${draftId} to Speediance (custom training template appears in the mobile app)`;
      queue.push({ id, tool: name, args, summary });
      return { ok: true, queued: true, draftId, message: 'Queued — push happens after approval.' };
    }

    case 'unsave_draft_from_speediance': {
      const draftId = String(args.draftId ?? '');
      if (!draftId) return { error: 'draftId is required' };
      const summary = `Remove workout draft ${draftId} from Speediance (status flips back to draft)`;
      queue.push({ id, tool: name, args, summary });
      return {
        ok: true,
        queued: true,
        draftId,
        message: 'Queued — Speediance call happens after approval.',
      };
    }

    default: {
      // Defensive: a write tool we forgot to handle. Fall back to a
      // generic queue entry rather than executing.
      queue.push({ id, tool: name, args, summary: `${name}` });
      return { ok: true, queued: true };
    }
  }
}

/** Match the existing `newDraftId` shape so the client URLs work. */
function newShortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

export interface ExecuteResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
