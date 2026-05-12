'use server';

import { createDb } from '@speediance/db';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const FeedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'suggestion', 'question', 'other']),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(5000),
});

export interface FeedbackResult {
  ok: boolean;
  message: string;
}

/**
 * Stores a user-submitted feedback item. Server-side: validate, write to
 * DDB scoped to the signed-in user. Admins can scan across users via the
 * service-level entity (Phase 1.8 admin page).
 */
export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData,
): Promise<FeedbackResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { ok: false, message: 'DB not configured.' };

  const parsed = FeedbackSchema.safeParse({
    category: formData.get('category'),
    subject: formData.get('subject'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.errors[0]?.message ?? 'Check the form and try again.',
    };
  }

  const me = createDb({ tableName }).forUser(claims.sub);
  try {
    await me.feedback.put({
      createdAt: new Date().toISOString(),
      userEmail: claims.email,
      category: parsed.data.category,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: 'open',
    });
    return { ok: true, message: 'Thanks — got it. We will look it over.' };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export interface FeedbackRow {
  createdAt: string;
  category?: string;
  subject?: string;
  body?: string;
  status?: string;
}

export async function listMyFeedback(): Promise<FeedbackRow[]> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return [];
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const me = createDb({ tableName }).forUser(claims.sub);
  const result = (await me.feedback.list()) as { data: FeedbackRow[] };
  return (result.data ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export interface AdminFeedbackRow extends FeedbackRow {
  userId: string;
  userEmail?: string;
}

/**
 * Cross-user feedback list for the admin page. Uses an unscoped service
 * entity scan — every other read in this codebase is user-scoped, but
 * triaging feedback intentionally needs to see across users.
 *
 * Authorization: only signed-in users can hit this; group/role gating
 * is Phase 4.x (when we add cognito:groups).
 */
export async function listAllFeedback(): Promise<AdminFeedbackRow[]> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return [];
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const db = createDb({ tableName });
  const result = (await db.service.entities.feedback.scan.go({ pages: 'all' })) as {
    data: AdminFeedbackRow[];
  };
  return (result.data ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}
