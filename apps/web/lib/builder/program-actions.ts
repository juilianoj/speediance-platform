'use server';

import { randomUUID } from 'crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createDb } from '@speediance/db';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const SlotSchema = z.object({
  weekIndex: z.number().int().min(0).max(15),
  dayOfWeek: z.number().int().min(0).max(6),
  draftId: z.string().trim().min(1).max(50),
  label: z.string().trim().max(120).optional(),
});

const ProgramUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(5000).optional(),
  weekCount: z.number().int().min(1).max(16).optional(),
  slots: z.array(SlotSchema).max(80).optional(),
});

export interface ProgramSlot {
  weekIndex: number;
  dayOfWeek: number;
  draftId: string;
  label?: string;
}

export interface ProgramReservation {
  date: string;
  templateId: number;
  templateCode?: string;
  draftId?: string;
}

export interface ProgramDraftRow {
  programId: string;
  name: string;
  notes?: string;
  weekCount: number;
  slots: ProgramSlot[];
  status: 'draft' | 'scheduled';
  scheduledStartDate?: string;
  scheduledReservations?: ProgramReservation[];
  createdAt: string;
  updatedAt?: string;
}

export interface ProgramMutationResult {
  ok: boolean;
  message?: string;
  programId?: string;
}

function dbOrNull() {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  return tableName ? createDb({ tableName }) : null;
}

function newProgramId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

export async function listMyPrograms(): Promise<ProgramDraftRow[]> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return [];
  const db = dbOrNull();
  if (!db) return [];
  const me = db.forUser(claims.sub);
  const res = (await me.programDrafts.list()) as { data: ProgramDraftRow[] };
  return (res.data ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function getProgram(programId: string): Promise<ProgramDraftRow | null> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return null;
  const db = dbOrNull();
  if (!db) return null;
  const me = db.forUser(claims.sub);
  const res = (await me.programDrafts.get(programId)) as { data: ProgramDraftRow | null };
  return res?.data ?? null;
}

export async function createProgram(): Promise<never> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const db = dbOrNull();
  if (!db) throw new Error('DB not configured');
  const programId = newProgramId();
  const me = db.forUser(claims.sub);
  await me.programDrafts.upsert({
    programId,
    name: 'New program',
    weekCount: 4,
    slots: [],
    status: 'draft',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/builder');
  redirect(`/builder/programs/${programId}`);
}

export async function updateProgram(
  programId: string,
  patch: { name?: string; notes?: string; weekCount?: number; slots?: ProgramSlot[] },
): Promise<ProgramMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };

  const parsed = ProgramUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Invalid input.' };
  }
  if (Object.keys(parsed.data).length === 0) return { ok: true };

  const me = db.forUser(claims.sub);
  try {
    await me.programDrafts.patch(programId, parsed.data);
    revalidatePath(`/builder/programs/${programId}`);
    revalidatePath('/builder');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function deleteProgram(programId: string): Promise<ProgramMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    await me.programDrafts.delete(programId);
    revalidatePath('/builder');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Delete failed.' };
  }
}

/**
 * Schedule the program to Speediance starting on `startDate`. Materializes
 * each slot to (date + templateId) and persists the resulting reservations
 * back to the program row. Idempotent — running again with a different
 * date unreserves the prior dates first.
 */
export async function scheduleProgramAction(
  programId: string,
  startDate: string,
): Promise<ProgramMutationResult & { failures?: number; reservations?: number }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    const programRes = (await me.programDrafts.get(programId)) as {
      data: ProgramDraftRow | null;
    };
    const program = programRes?.data;
    if (!program) return { ok: false, message: 'Program not found.' };
    if (program.slots.length === 0) {
      return { ok: false, message: 'Program has no slots assigned.' };
    }

    const { scheduleProgram } = await import('./program-schedule');
    const summary = await scheduleProgram(claims.sub, program, startDate);
    revalidatePath(`/builder/programs/${programId}`);
    revalidatePath('/builder');
    revalidatePath('/dashboard');
    return {
      ok: summary.ok,
      message: summary.message,
      reservations: summary.reservations.length,
      failures: summary.failures.length,
      programId,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Schedule failed.' };
  }
}

export async function unscheduleProgramAction(programId: string): Promise<ProgramMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    const programRes = (await me.programDrafts.get(programId)) as {
      data: ProgramDraftRow | null;
    };
    const program = programRes?.data;
    if (!program) return { ok: false, message: 'Program not found.' };

    const { unscheduleProgram } = await import('./program-schedule');
    const r = await unscheduleProgram(claims.sub, program);
    revalidatePath(`/builder/programs/${programId}`);
    revalidatePath('/builder');
    revalidatePath('/dashboard');
    return r;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unschedule failed.' };
  }
}
