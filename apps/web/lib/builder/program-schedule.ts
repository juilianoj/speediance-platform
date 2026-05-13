import 'server-only';

import { createDb } from '@speediance/db';

import { createRefreshingSpeedianceClient } from '@/lib/speediance/refreshing-client';

import type { WorkoutDraftRow } from './actions';
import type { ProgramDraftRow, ProgramReservation, ProgramSlot } from './program-actions';
import { pushDraftToSpeediance } from './save-to-speediance';

// Re-export so callers don't reach into program-actions for the type.
export type { ProgramReservation };

/**
 * Materialize a ProgramDraft's slots into actual Speediance reservations.
 *
 * Steps per slot:
 *   1. Load the referenced WorkoutDraft from DDB. Skip the slot if the
 *      draft was deleted, surfacing the failure in the summary.
 *   2. Ensure the draft has a `speedianceTemplateId` — if it doesn't, push
 *      it to Speediance now (PR γ save flow). The resulting templateId
 *      gets persisted back to the draft so subsequent re-schedules don't
 *      re-create it.
 *   3. Compute the calendar date for the slot:
 *        date = startDate + 7 * weekIndex + (dayOfWeek - startDateDow + 7) % 7
 *      i.e. the first occurrence of `dayOfWeek` on or after startDate,
 *      then weekIndex*7 days further. This makes week 1 always the week
 *      containing startDate, regardless of which day-of-week the user
 *      picks as the start.
 *   4. Call scheduleWorkout(date, templateCode, status=1).
 *
 * Re-scheduling is idempotent at the user-visible level: prior
 * `scheduledReservations` get UNRESERVED first, then the new ones get
 * placed. The order (place-new, then-unreserve-old) is fine here because
 * the dates differ across runs.
 *
 * Returns a summary that's safe to render directly to the user.
 */
export interface ScheduleProgramSummary {
  ok: boolean;
  reservations: ProgramReservation[];
  /** Slots we couldn't materialize, with the reason. */
  failures: Array<{ slot: ProgramSlot; reason: string }>;
  message?: string;
}

export async function scheduleProgram(
  userId: string,
  program: ProgramDraftRow,
  startDate: string, // YYYY-MM-DD
): Promise<ScheduleProgramSummary> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) {
    return { ok: false, reservations: [], failures: [], message: 'DB not configured.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, reservations: [], failures: [], message: 'Invalid start date.' };
  }

  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) {
    return {
      ok: false,
      reservations: [],
      failures: [],
      message: 'Speediance creds not configured.',
    };
  }
  const db = createDb({ tableName });
  const me = db.forUser(userId);

  // First, tear down any prior reservations from a previous schedule
  // pass — same program, different start date. Best-effort.
  if (Array.isArray(program.scheduledReservations)) {
    for (const r of program.scheduledReservations) {
      if (!r.templateCode) continue;
      try {
        await client.scheduleWorkout(r.date, r.templateCode, 0);
      } catch (err) {
        console.warn(`scheduleProgram: failed to unreserve prior ${r.date}/${r.templateCode}`, err);
      }
    }
  }

  const startDow = dayOfWeekFor(startDate); // 0=Sun..6=Sat
  const reservations: ProgramReservation[] = [];
  const failures: Array<{ slot: ProgramSlot; reason: string }> = [];

  for (const slot of program.slots) {
    try {
      // Step 1: load the workout draft
      const draftRes = (await me.workoutDrafts.get(slot.draftId)) as {
        data: WorkoutDraftRow | null;
      };
      const draft = draftRes?.data;
      if (!draft) {
        failures.push({ slot, reason: `referenced workout (${slot.draftId}) was deleted` });
        continue;
      }

      // Step 2: ensure the draft is saved on Speediance
      let templateCode = draft.speedianceTemplateCode;
      let templateId = draft.speedianceTemplateId;
      if (!templateCode || templateId === undefined) {
        try {
          const pushed = await pushDraftToSpeediance(userId, draft);
          templateCode = pushed.templateCode;
          templateId = pushed.templateId;
          // Persist back so the next schedule pass / direct save sees it.
          await me.workoutDrafts.patch(slot.draftId, {
            status: 'saved-to-speediance',
            speedianceTemplateCode: templateCode,
            speedianceTemplateId: templateId,
          });
        } catch (err) {
          failures.push({
            slot,
            reason: `couldn't push to Speediance: ${err instanceof Error ? err.message : 'unknown'}`,
          });
          continue;
        }
      }

      // Step 3: compute the calendar date
      const dayOffset = (slot.dayOfWeek - startDow + 7) % 7;
      const totalDays = slot.weekIndex * 7 + dayOffset;
      const date = addDays(startDate, totalDays);

      // Step 4: schedule it on Speediance
      try {
        await client.scheduleWorkout(date, templateCode, 1);
        reservations.push({
          date,
          templateId: templateId!,
          templateCode,
          draftId: slot.draftId,
        });
      } catch (err) {
        failures.push({
          slot,
          reason: `Speediance schedule for ${date} failed: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    } catch (err) {
      failures.push({
        slot,
        reason: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  // Persist status + reservations on the ProgramDraft.
  await me.programDrafts.patch(program.programId, {
    status: 'scheduled',
    scheduledStartDate: startDate,
    scheduledReservations: reservations,
  });

  return {
    ok: failures.length === 0,
    reservations,
    failures,
    message:
      failures.length === 0
        ? `Scheduled ${reservations.length} workout${reservations.length === 1 ? '' : 's'}.`
        : `Scheduled ${reservations.length} of ${program.slots.length} — ${failures.length} failed.`,
  };
}

/**
 * Unschedule a program: removes every reservation from Speediance and
 * flips the program's status back to draft. Idempotent.
 */
export async function unscheduleProgram(
  userId: string,
  program: ProgramDraftRow,
): Promise<{ ok: boolean; message?: string }> {
  if (program.status !== 'scheduled' || !program.scheduledReservations?.length) {
    return { ok: true };
  }
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) return { ok: false, message: 'Speediance creds not configured.' };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { ok: false, message: 'DB not configured.' };
  const db = createDb({ tableName });
  const me = db.forUser(userId);

  let failures = 0;
  for (const r of program.scheduledReservations) {
    if (!r.templateCode) continue;
    try {
      await client.scheduleWorkout(r.date, r.templateCode, 0);
    } catch (err) {
      console.warn(`unscheduleProgram: failed for ${r.date}/${r.templateCode}`, err);
      failures++;
    }
  }
  await me.programDrafts.patch(program.programId, {
    status: 'draft',
    scheduledStartDate: undefined,
    scheduledReservations: [],
  });
  return {
    ok: failures === 0,
    message: failures === 0 ? undefined : `${failures} reservation(s) failed to unschedule.`,
  };
}

function dayOfWeekFor(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
