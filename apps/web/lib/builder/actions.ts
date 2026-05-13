'use server';

import { randomUUID } from 'crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createDb } from '@speediance/db';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const SetSchema = z.object({
  reps: z.number().int().min(1).max(200).optional(),
  weight: z.number().min(0).max(1000).optional(),
  restSeconds: z.number().int().min(0).max(600).optional(),
});

const ExerciseSchema = z.object({
  groupId: z.string().trim().min(1).max(50),
  sets: z.array(SetSchema).min(1).max(20),
  orderHint: z.number().int().min(0).max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const DraftUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(5000).optional(),
  exercises: z.array(ExerciseSchema).max(30).optional(),
});

export interface DraftSet {
  reps?: number;
  weight?: number;
  restSeconds?: number;
}

export interface DraftExercise {
  groupId: string;
  sets: DraftSet[];
  orderHint?: number;
  notes?: string;
}

export interface WorkoutDraftRow {
  draftId: string;
  name: string;
  notes?: string;
  exercises: DraftExercise[];
  status: 'draft' | 'saved-to-speediance';
  speedianceTemplateCode?: string;
  speedianceTemplateId?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface DraftMutationResult {
  ok: boolean;
  message?: string;
  draftId?: string;
}

function dbOrNull() {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  return tableName ? createDb({ tableName }) : null;
}

/** Compact, URL-safe draft id. crypto.randomUUID is enough — drafts are
 *  per-user-scoped so collisions across users don't matter. */
function newDraftId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * List the user's drafts, newest first. Used by /builder index.
 */
export async function listMyDrafts(): Promise<WorkoutDraftRow[]> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return [];
  const db = dbOrNull();
  if (!db) return [];
  const me = db.forUser(claims.sub);
  const res = (await me.workoutDrafts.list()) as { data: WorkoutDraftRow[] };
  return (res.data ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function getDraft(draftId: string): Promise<WorkoutDraftRow | null> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return null;
  const db = dbOrNull();
  if (!db) return null;
  const me = db.forUser(claims.sub);
  const res = (await me.workoutDrafts.get(draftId)) as { data: WorkoutDraftRow | null };
  return res?.data ?? null;
}

/**
 * Create a new empty draft and redirect the user to its editor. Form
 * action — bound to the "New workout" button on /builder.
 */
export async function createDraft(): Promise<never> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const db = dbOrNull();
  if (!db) throw new Error('DB not configured');
  const draftId = newDraftId();
  const me = db.forUser(claims.sub);
  await me.workoutDrafts.upsert({
    draftId,
    name: 'New workout',
    exercises: [],
    status: 'draft',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/builder');
  redirect(`/builder/${draftId}`);
}

/**
 * Apply a partial update to a draft. Used for renames, exercise reorders,
 * set edits, etc. Validates input shape via Zod so a hostile client can't
 * smuggle extra fields onto the DDB row.
 */
export async function updateDraft(
  draftId: string,
  patch: { name?: string; notes?: string; exercises?: DraftExercise[] },
): Promise<DraftMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };

  const parsed = DraftUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? 'Invalid input.' };
  }
  if (Object.keys(parsed.data).length === 0) return { ok: true };

  const me = db.forUser(claims.sub);
  try {
    await me.workoutDrafts.patch(draftId, parsed.data);
    revalidatePath(`/builder/${draftId}`);
    revalidatePath('/builder');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function deleteDraft(draftId: string): Promise<DraftMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    await me.workoutDrafts.delete(draftId);
    revalidatePath('/builder');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Delete failed.' };
  }
}

/**
 * Push the draft to Speediance as a custom training template. The
 * created template shows up on the user's mobile app and can be
 * scheduled / started normally from there.
 *
 * Re-running is idempotent at the user-visible level — under the hood
 * we DELETE the previous template and POST a new one, but the user just
 * sees their template updated. The order (create-then-delete) ensures
 * there's never a window with no template on the device.
 */
export async function saveDraftToSpeediance(draftId: string): Promise<DraftMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    const draftRes = (await me.workoutDrafts.get(draftId)) as { data: WorkoutDraftRow | null };
    const draft = draftRes?.data;
    if (!draft) return { ok: false, message: 'Draft not found.' };

    // Lazy import so the server action's cold-path doesn't pull in the
    // whole Speediance client + secrets store unless this action actually
    // runs.
    const { pushDraftToSpeediance } = await import('./save-to-speediance');
    const { templateCode, templateId } = await pushDraftToSpeediance(claims.sub, draft);

    await me.workoutDrafts.patch(draftId, {
      status: 'saved-to-speediance',
      speedianceTemplateCode: templateCode,
      speedianceTemplateId: templateId,
    });
    revalidatePath(`/builder/${draftId}`);
    revalidatePath('/builder');
    return { ok: true, draftId };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Save to Speediance failed.',
    };
  }
}

/** Remove the draft's Speediance template (status flips back to draft). */
export async function unsaveDraftFromSpeediance(draftId: string): Promise<DraftMutationResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const db = dbOrNull();
  if (!db) return { ok: false, message: 'DB not configured.' };
  const me = db.forUser(claims.sub);
  try {
    const draftRes = (await me.workoutDrafts.get(draftId)) as { data: WorkoutDraftRow | null };
    const draft = draftRes?.data;
    if (!draft) return { ok: false, message: 'Draft not found.' };

    const { removeDraftFromSpeediance } = await import('./save-to-speediance');
    await removeDraftFromSpeediance(claims.sub, draft);

    await me.workoutDrafts.patch(draftId, {
      status: 'draft',
      speedianceTemplateCode: undefined,
      speedianceTemplateId: undefined,
    });
    revalidatePath(`/builder/${draftId}`);
    revalidatePath('/builder');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unsave failed.' };
  }
}
