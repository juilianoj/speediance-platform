'use server';

import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserMFAPreferenceCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const region = process.env.AWS_REGION ?? 'us-west-2';

const InviteSchema = z.object({
  email: z.string().email().max(320),
});

export interface InviteResult {
  ok: boolean;
  message: string;
}

/**
 * Cognito admin-invite flow (Phase 4.1). Creates a user in the configured
 * pool with a temporary password and tells Cognito to email them.
 *
 * Authorization: any signed-in user can invite (we don't have a group
 * model yet — Phase 4 follow-up). When we do, gate this on
 * `cognito:groups` claim including "admin".
 */
export async function inviteUser(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in to invite.' };
  const parsed = InviteSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const { email } = parsed.data;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return { ok: false, message: 'COGNITO_USER_POOL_ID not set.' };

  const client = new CognitoIdentityProviderClient({ region });
  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );
    return { ok: true, message: `Invite emailed to ${email}.` };
  } catch (err: unknown) {
    // Cognito surfaces "user already exists" as UsernameExistsException.
    const message =
      err instanceof Error
        ? err.name === 'UsernameExistsException'
          ? 'That user already exists.'
          : err.message
        : 'Invite failed.';
    return { ok: false, message };
  }
}

/**
 * Force a sync run for the signed-in user. Async ("Event") invoke — we
 * don't block the UI on the actual sync; the user reloads /dashboard a
 * minute later.
 */
export async function resyncMe(): Promise<{ ok: boolean; message: string }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const fnName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (!fnName) return { ok: false, message: 'SYNC_WORKER_FUNCTION_NAME env var missing.' };

  try {
    await new LambdaClient({ region }).send(
      new InvokeCommand({
        FunctionName: fnName,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify({ userId: claims.sub })),
      }),
    );
    return { ok: true, message: 'Sync started. Check /dashboard in ~30s.' };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'Resync failed.' };
  }
}

/**
 * Trigger an exercise-catalog bootstrap. The sync-worker Lambda
 * enumerates every exercise in the user's Speediance action library and
 * writes the metadata to our `ExerciseCatalog` table — the workout
 * builder reads from this cache so it never hits the Speediance API on
 * the UI hot path.
 *
 * Async ("Event") invoke — the job runs 3-5 min for ~500 exercises. The
 * caller polls catalog size to confirm completion.
 */
export async function rebuildExerciseCatalog(): Promise<{ ok: boolean; message: string }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const fnName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (!fnName) return { ok: false, message: 'SYNC_WORKER_FUNCTION_NAME env var missing.' };
  try {
    await new LambdaClient({ region }).send(
      new InvokeCommand({
        FunctionName: fnName,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(
          JSON.stringify({ mode: 'catalog-bootstrap', userId: claims.sub }),
        ),
      }),
    );
    return { ok: true, message: 'Catalog rebuild started. ~3-5 min.' };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'Trigger failed.' };
  }
}

/** Size of the global ExerciseCatalog cache (used to confirm bootstrap landed). */
export async function getCatalogSize(): Promise<{ count: number }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { count: 0 };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { count: 0 };
  const { createDb } = await import('@speediance/db');
  const db = createDb({ tableName });
  const res = (await db.global.exerciseCatalog.list()) as { data: unknown[] };
  return { count: res.data?.length ?? 0 };
}

/**
 * Return the current `lastSyncedAt` timestamp for the signed-in user.
 * Used by the dashboard's SyncBanner to poll for sync completion after
 * the user clicks Refresh — the sync worker writes this field when it
 * finishes, so a change tells us the run is done.
 */
export async function getMyLastSyncedAt(): Promise<{ lastSyncedAt: string | null }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { lastSyncedAt: null };
  // Lazy import — keeps admin/actions free of DDB on cold-paths it doesn't
  // need (the imports above are all Cognito + Lambda).
  const { loadProfile } = await import('@/app/profile/load-profile');
  const profile = await loadProfile(claims.sub);
  return { lastSyncedAt: profile?.lastSyncedAt ?? null };
}

export interface AdminUser {
  email?: string;
  username: string;
  status: string;
  enabled: boolean;
  createdAt?: string;
}

/**
 * List users in the pool — for the admin page. Maps Cognito's verbose
 * shape to the shape we want to render.
 */
export interface MfaStatus {
  enabled: boolean;
  preferred: boolean;
}

/**
 * Returns the current TOTP MFA state for the signed-in user. Used by the
 * /profile MFA toggle to know whether to show "Enable" or "Disable".
 */
export async function getMyMfaStatus(): Promise<MfaStatus> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { enabled: false, preferred: false };
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return { enabled: false, preferred: false };
  try {
    const result = await new CognitoIdentityProviderClient({ region }).send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: claims.sub }),
    );
    const settings = result.UserMFASettingList ?? [];
    const enabled = settings.includes('SOFTWARE_TOKEN_MFA');
    const preferred = result.PreferredMfaSetting === 'SOFTWARE_TOKEN_MFA';
    return { enabled, preferred };
  } catch {
    return { enabled: false, preferred: false };
  }
}

/**
 * Toggles TOTP MFA for the signed-in user. Disable simply un-enrolls; if
 * the user later re-enables it, they'll go through the standard MFA_SETUP
 * QR-scan flow again because the previous TOTP secret was discarded by
 * Cognito the moment they disabled it.
 *
 * Authorization: any signed-in user can toggle their own MFA, scoped via
 * `claims.sub` — they cannot toggle anyone else's.
 */
export async function setMyMfa(enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return { ok: false, message: 'COGNITO_USER_POOL_ID not set.' };
  try {
    await new CognitoIdentityProviderClient({ region }).send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: claims.sub,
        SoftwareTokenMfaSettings: { Enabled: enabled, PreferredMfa: enabled },
      }),
    );
    return {
      ok: true,
      message: enabled
        ? 'MFA enabled — you will be prompted to set up a new authenticator on next sign-in.'
        : 'MFA disabled. Sign-ins will only require email + password.',
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'MFA toggle failed.' };
  }
}

export async function listUsers(): Promise<AdminUser[]> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return [];
  const client = new CognitoIdentityProviderClient({ region });
  const result = await client.send(new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60 }));
  return (result.Users ?? []).map((u) => ({
    username: u.Username ?? '?',
    email: u.Attributes?.find((a) => a.Name === 'email')?.Value,
    status: u.UserStatus ?? 'UNKNOWN',
    enabled: u.Enabled ?? false,
    createdAt: u.UserCreateDate?.toISOString(),
  }));
}
