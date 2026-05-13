'use server';

import { revalidatePath } from 'next/cache';

import { createDb } from '@speediance/db';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const TargetSchema = z.enum(['workout', 'exercise']);

const AddNoteSchema = z.object({
  targetType: TargetSchema,
  targetId: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(5000),
});

const DeleteNoteSchema = z.object({
  targetType: TargetSchema,
  targetId: z.string().trim().min(1).max(500),
  createdAt: z.string().trim().min(1).max(64),
});

export interface NoteRow {
  targetType: 'workout' | 'exercise';
  targetId: string;
  createdAt: string;
  body: string;
  updatedAt?: string;
}

export interface MutationResult {
  ok: boolean;
  message?: string;
}

function dbOrNull() {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  return tableName ? createDb({ tableName }) : null;
}

/** Load every note for one workout / exercise, newest first. */
export async function listNotes(
  targetType: 'workout' | 'exercise',
  targetId: string,
): Promise<NoteRow[]> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return [];
  const db = dbOrNull();
  if (!db) return [];
  const me = db.forUser(claims.sub);
  const res = (await me.notes.forTarget(targetType, targetId)) as { data: NoteRow[] };
  return (res.data ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

/**
 * Append a note. Form-action shape so the workout / exercise pages can
 * use a plain `<form action={...}>` without a client component for the
 * happy path. `revalidatePath` triggers a fresh server render so the new
 * note appears without a manual refresh.
 */
export async function addNote(formData: FormData): Promise<MutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };

  const parsed = AddNoteSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Invalid input.' };
  }

  const me = db.forUser(claims.sub);
  try {
    await me.notes.put({
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      createdAt: new Date().toISOString(),
      body: parsed.data.body,
    });
    revalidatePath(pathFor(parsed.data.targetType, parsed.data.targetId));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function deleteNote(formData: FormData): Promise<MutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };

  const parsed = DeleteNoteSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    createdAt: formData.get('createdAt'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Invalid input.' };
  }

  const me = db.forUser(claims.sub);
  try {
    await me.notes.delete(parsed.data.targetType, parsed.data.targetId, parsed.data.createdAt);
    revalidatePath(pathFor(parsed.data.targetType, parsed.data.targetId));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Delete failed.' };
  }
}

function pathFor(targetType: 'workout' | 'exercise', targetId: string): string {
  if (targetType === 'workout') return `/workouts/${encodeURIComponent(targetId)}`;
  return `/exercises/${encodeURIComponent(targetId)}`;
}
