import 'server-only';

import { type SaveWorkoutExercise } from '@speediance/speediance-client';

import { createRefreshingSpeedianceClient } from '@/lib/speediance/refreshing-client';
import { getExercise } from '@/lib/catalog/lookup';

import type { DraftExercise, WorkoutDraftRow } from './actions';

/**
 * Push a WorkoutDraft to Speediance as a custom training template.
 *
 * If the draft is already saved (`status: 'saved-to-speediance'`), we
 * DELETE the previous template first, then create a new one. This is
 * simpler than ElectroDB's update semantics (Speediance's API does
 * support template-edit via the same POST endpoint with a `templateId`
 * payload, but the response shape differs and the cost of delete+create
 * is negligible at our scale — one extra round trip).
 *
 * Returns the new templateCode + templateId. Throws on any error so the
 * server action can surface a useful message to the user.
 */
export async function pushDraftToSpeediance(
  userId: string,
  draft: WorkoutDraftRow,
): Promise<{ templateCode: string; templateId: number }> {
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) {
    throw new Error('Speediance creds not configured — connect on /profile first.');
  }

  if (draft.exercises.length === 0) {
    throw new Error('Workout has no exercises.');
  }

  // Convert each draft exercise into the saveWorkout shape. We pull
  // `variant_id` from our catalog cache (= defaultVariantId =
  // actionLibraryList[0].id from Speediance's action library) so the
  // client's `saveWorkout` doesn't need to round-trip through
  // getBatchDetails for every exercise. This is the v1 path — assumes
  // we want the default variant; future "swap to barbell variant"
  // features would override this.
  const exercises: SaveWorkoutExercise[] = await Promise.all(
    draft.exercises.map(async (ex) => convertExercise(ex)),
  );

  // POST to Speediance. The response is the new template's `code`
  // (24-char hex string).
  const saveResp = (await client.saveWorkout(draft.name, exercises)) as
    | string
    | { code?: string; data?: string }
    | null;
  const newCode = extractTemplateCode(saveResp);
  if (!newCode) {
    throw new Error('Speediance returned no template code.');
  }

  // Look up the freshly-created template's numeric id (we need it later
  // to delete or schedule). Doing one round-trip through
  // /v4/customTrainingTemplate/appPage and filtering by code.
  const list = (await client.getUserWorkouts()) as Array<{ id?: number; code?: string }>;
  const created = list.find((w) => w.code === newCode);
  if (!created || typeof created.id !== 'number') {
    throw new Error('Saved on Speediance but could not look up template id.');
  }

  // If the draft was previously saved, DELETE the prior template now
  // that the replacement is in place. Order matters: create-then-delete
  // means the user never sees a window with no template.
  if (draft.status === 'saved-to-speediance' && draft.speedianceTemplateId !== undefined) {
    try {
      await client.deleteWorkout(draft.speedianceTemplateId);
    } catch (err) {
      // Non-fatal — the new template is in place, the user just has a
      // stale one to clean up. Log + continue.
      console.warn(
        `pushDraftToSpeediance: failed to delete prior template ${draft.speedianceTemplateId}`,
        err,
      );
    }
  }

  return { templateCode: newCode, templateId: created.id };
}

/**
 * Remove a draft's Speediance template (used when the user clicks
 * "Unsave"). Idempotent — silently no-ops if the draft was never saved.
 */
export async function removeDraftFromSpeediance(
  userId: string,
  draft: WorkoutDraftRow,
): Promise<void> {
  if (draft.status !== 'saved-to-speediance' || draft.speedianceTemplateId === undefined) {
    return;
  }
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) {
    throw new Error('Speediance creds not configured.');
  }
  await client.deleteWorkout(draft.speedianceTemplateId);
}

async function convertExercise(ex: DraftExercise): Promise<SaveWorkoutExercise> {
  const catalogEntry = await getExercise(ex.groupId);
  const numericGroupId = Number(ex.groupId);
  if (!Number.isFinite(numericGroupId)) {
    throw new Error(`Exercise has invalid groupId: ${ex.groupId}`);
  }
  return {
    groupId: numericGroupId,
    variant_id: catalogEntry?.defaultVariantId,
    preset_id: -1, // -1 = custom (vs preset RM-based template)
    sets: ex.sets.map((s) => ({
      reps: s.reps ?? 10,
      weight: s.weight ?? 0,
      mode: 1, // 1 = lift (strength). Cardio modes TBD.
      rest: s.restSeconds ?? 60,
      unit: 'reps' as const,
    })),
  };
}

/**
 * Speediance's saveWorkout response is the new template's `code` string.
 * Depending on which path through `request<T>` the client took, this can
 * arrive as:
 *   - The unwrapped string (envelope.data)
 *   - A full envelope `{ code: 0, data: "abc..." }` (when envelope parse
 *     didn't unwrap)
 *   - Or `{ data: "abc..." }`
 * Be defensive here.
 */
function extractTemplateCode(resp: unknown): string | null {
  if (typeof resp === 'string') return resp;
  if (resp && typeof resp === 'object') {
    const r = resp as Record<string, unknown>;
    if (typeof r.data === 'string') return r.data;
  }
  return null;
}

/** Surface a deletable list of orphaned Speediance templates — used by
 *  the admin page when the user wants to clean up after failed pushes. */
export async function listSavedTemplates(
  userId: string,
): Promise<Array<{ id: number; code: string; name: string }>> {
  const client = await createRefreshingSpeedianceClient(userId);
  if (!client) return [];
  const list = (await client.getUserWorkouts()) as Array<{
    id?: number;
    code?: string;
    name?: string;
  }>;
  return list
    .filter(
      (w): w is { id: number; code: string; name: string } =>
        typeof w.id === 'number' && typeof w.code === 'string' && typeof w.name === 'string',
    )
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));
}
