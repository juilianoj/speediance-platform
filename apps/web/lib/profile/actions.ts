'use server';

import 'server-only';

import { randomBytes } from 'node:crypto';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { createDb } from '@speediance/db';
import { createSecretsStore } from '@speediance/secrets-store';
import { SpeedianceClient } from '@speediance/speediance-client';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { ProfileInputSchema, type ProfileSaveResult } from './schemas';

let cachedLambda: LambdaClient | undefined;
function getLambda(): LambdaClient {
  if (!cachedLambda) {
    cachedLambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'us-west-2' });
  }
  return cachedLambda;
}

/**
 * Server Action that saves a user's profile + Speediance credentials.
 *
 * Flow:
 *   1. Verify Cognito session (the form is gated, but defence in depth)
 *   2. Validate inputs
 *   3. If a password was supplied, log in to Speediance to *verify the
 *      credentials work* and capture a fresh token (so the sync worker
 *      doesn't have to log in again right after).
 *   4. Write encrypted creds to Secrets Manager (one secret per Cognito
 *      user; KMS-encrypted at rest).
 *   5. Upsert the Profile DynamoDB item with the non-secret fields and
 *      the secret's ARN.
 *
 * On any credential-validation failure, returns 'invalidCreds' so the form
 * shows a helpful message instead of generic "Save failed."
 */
export async function saveProfile(
  _prev: ProfileSaveResult | null,
  formData: FormData,
): Promise<ProfileSaveResult> {
  // -- 1. Auth
  const claims = await verifyIdTokenFromCookies();
  if (!claims) {
    return { state: 'error', message: 'Session expired. Reload the page and sign in again.' };
  }
  const userId = claims.sub;

  // -- 2. Validate
  const parsed = ProfileInputSchema.safeParse({
    speedianceEmail: formData.get('speedianceEmail'),
    speediancePassword: formData.get('speediancePassword'),
    region: formData.get('region'),
    deviceType: formData.get('deviceType'),
    allowMonsterMoves: formData.get('allowMonsterMoves') === 'on',
    bodyweight: formData.get('bodyweight') || undefined,
    gender: formData.get('gender') || undefined,
    hideCardio: formData.get('hideCardio') === 'on',
    unit: formData.get('unit'),
    syncStartDate: formData.get('syncStartDate') || undefined,
    primaryGoal: formData.get('primaryGoal') || undefined,
    sessionsPerWeek: formData.get('sessionsPerWeek') || undefined,
    sessionMinutes: formData.get('sessionMinutes') || undefined,
    equipmentConstraints:
      typeof formData.get('equipmentConstraints') === 'string'
        ? (formData.get('equipmentConstraints') as string).trim() || undefined
        : undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      state: 'error',
      message: `${first?.path.join('.') ?? 'input'}: ${first?.message ?? 'invalid'}`,
    };
  }
  const input = parsed.data;

  // -- 3. Fetch existing state
  const stage = process.env.SST_STAGE ?? 'dev';
  const secrets = createSecretsStore({ stage });
  const existingSecret = await secrets.get(userId);

  // First save requires a password; updates can leave it blank to keep
  // the existing one. The Schema can't enforce this — it doesn't know
  // whether a secret already exists.
  const passwordToUse = input.speediancePassword || existingSecret?.password;
  if (!passwordToUse) {
    return {
      state: 'error',
      message: 'Speediance password is required on first save.',
    };
  }

  // -- 4. Verify credentials by logging in to Speediance
  let token: string | undefined;
  let appUserId: string | undefined;
  try {
    const client = new SpeedianceClient(null, { region: input.region });
    const login = await client.login(input.speedianceEmail, passwordToUse);
    if (!login.ok || !login.credentials) {
      return {
        state: 'invalidCreds',
        message: login.reason ?? 'Speediance rejected those credentials.',
      };
    }
    token = login.credentials.token;
    appUserId = login.credentials.userId;
  } catch (err) {
    console.error('Speediance login failed during profile save', err);
    return {
      state: 'invalidCreds',
      message: 'Could not reach Speediance to verify your credentials. Try again in a moment.',
    };
  }

  // -- 5. Store the secret
  const secretValue = {
    email: input.speedianceEmail,
    password: passwordToUse,
    region: input.region,
    deviceType: input.deviceType,
    allowMonsterMoves: input.allowMonsterMoves,
    token,
    appUserId,
    tokenAcquiredAt: new Date().toISOString(),
  };
  let secretArn: string;
  try {
    const result = await secrets.put(userId, secretValue);
    secretArn = result.arn;
  } catch (err) {
    console.error('Secret put failed', err);
    return { state: 'error', message: 'Failed to store credentials securely.' };
  }

  // -- 6. Upsert the Profile DynamoDB item
  try {
    const tableName = process.env.DYNAMO_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMO_TABLE_NAME env var not set');
    }
    const db = createDb({ tableName });
    const me = db.forUser(userId);
    const coachPrefsPayload: Record<string, unknown> = {};
    if (input.primaryGoal) coachPrefsPayload.primaryGoal = input.primaryGoal;
    if (input.sessionsPerWeek != null) coachPrefsPayload.sessionsPerWeek = input.sessionsPerWeek;
    if (input.sessionMinutes != null) coachPrefsPayload.sessionMinutes = input.sessionMinutes;
    if (input.equipmentConstraints)
      coachPrefsPayload.equipmentConstraints = input.equipmentConstraints;
    await me.profiles.upsert({
      email: claims.email,
      bodyweight: input.bodyweight,
      gender: input.gender,
      hideCardio: input.hideCardio,
      unit: input.unit,
      region: input.region,
      deviceType: input.deviceType,
      allowMonsterMoves: input.allowMonsterMoves,
      syncStartDate: input.syncStartDate,
      speedianceSecretArn: secretArn,
      coachPrefs: Object.keys(coachPrefsPayload).length > 0 ? coachPrefsPayload : undefined,
      // createdAt only on first save; ElectroDB doesn't have a clean
      // "set-if-absent" so we set it every time — overwriting with the
      // same value is fine for our purposes.
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Profile DDB upsert failed', err);
    return { state: 'error', message: 'Saved credentials but failed to update profile.' };
  }

  // -- 7. Kick off an immediate sync so the user sees data show up on
  //       /dashboard within a minute, instead of having to wait for the
  //       10:00 UTC cron. Best-effort — if the invoke fails, the user
  //       still gets data on the next scheduled run.
  const syncFnName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (syncFnName) {
    try {
      await getLambda().send(
        new InvokeCommand({
          FunctionName: syncFnName,
          // Event mode — return immediately; the sync runs in the background.
          InvocationType: 'Event',
          Payload: new TextEncoder().encode(JSON.stringify({ userId })),
        }),
      );
    } catch (err) {
      console.warn('immediate sync invoke failed (will rely on next cron)', err);
    }
  }

  return {
    state: 'ok',
    message:
      'Saved. Pulling your Speediance training history now — refresh /dashboard in a minute.',
  };
}

/**
 * Toggle `hideCardio` on the profile. Used by the empty-state on /cardio
 * for users without an Apple Health / Google Fit connection — clicking
 * "Hide cardio" drops the nav link and redirects /cardio.
 */
export async function setCardioHidden(hidden: boolean): Promise<{ ok: boolean }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { ok: false };
  try {
    const me = createDb({ tableName }).forUser(claims.sub);
    await me.profiles.patch({ hideCardio: hidden });
    return { ok: true };
  } catch (err) {
    console.error('setCardioHidden failed', err);
    return { ok: false };
  }
}

// ─── MCP API keys (remote Claude Desktop / IDE access) ─────────────────────
//
// The key format is `spd_` followed by 32 url-safe base64 chars — ~256 bits
// of entropy. That's well past brute-force range; we don't need a hash,
// IAM already gates raw DDB access.
//
// Format guard: never log the full key. The display-safe prefix is the
// first 12 characters (`spd_xxxxxxxx`) and is persisted onto the profile
// row so /profile can show it on subsequent visits.

const KEY_RANDOM_BYTES = 24; // 24 raw bytes → 32 base64-url chars
const PREFIX_LENGTH = 12; // `spd_` (4) + 8 chars

/** Generates a fresh opaque key. ~256 bits of entropy from /dev/urandom. */
function newApiKey(): { key: string; prefix: string } {
  const random = randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const key = `spd_${random}`;
  return { key, prefix: key.slice(0, PREFIX_LENGTH) };
}

export interface McpKeyGenerateResult {
  ok: true;
  /** Returned ONCE; the UI shows this in a copy-now banner and discards
   *  it after the user navigates away. After that, only the prefix is
   *  reachable (via the profile row). */
  key: string;
  prefix: string;
}

export interface McpKeyErrorResult {
  ok: false;
  message: string;
}

/**
 * Mint a new MCP API key for the signed-in user. If a key already
 * exists, it's revoked first (including its reverse-lookup row), so
 * the old token immediately stops working.
 *
 * Returns the full key value ONCE; the UI is responsible for showing it
 * to the user in a "copy now, this won't be displayed again" banner.
 * The display-safe prefix is also stored on the profile row.
 *
 * Logging: never `console.*` the full key. `redactKey` returns just the
 * prefix; the actions log only the prefix for traceability.
 */
export async function generateMcpKey(): Promise<McpKeyGenerateResult | McpKeyErrorResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in to generate an MCP key.' };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { ok: false, message: 'Server misconfigured (no DYNAMO_TABLE_NAME).' };

  try {
    const me = createDb({ tableName }).forUser(claims.sub);
    // Revoke the old key first so rotation is atomic-from-the-outside:
    // the user can't end up with two simultaneously-valid keys.
    await me.apiKeys.delete();

    const fresh = newApiKey();
    await me.apiKeys.put(fresh);
    await me.profiles.patch({ mcpApiKeyPrefix: fresh.prefix });

    // Trace log only — full key NEVER logged.
    console.info('mcp api key minted', { userId: claims.sub, prefix: fresh.prefix });
    return { ok: true, key: fresh.key, prefix: fresh.prefix };
  } catch (err) {
    console.error('generateMcpKey failed', err);
    return { ok: false, message: 'Failed to generate key. Try again.' };
  }
}

export interface McpKeyRevokeResult {
  ok: boolean;
  message?: string;
}

/**
 * Revoke the user's active MCP key (if any). After this returns the
 * old token stops authenticating against `POST /mcp`. The profile row's
 * `mcpApiKeyPrefix` is cleared so the UI reflects "no active key".
 */
export async function revokeMcpKey(): Promise<McpKeyRevokeResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return { ok: false, message: 'Server misconfigured.' };

  try {
    const me = createDb({ tableName }).forUser(claims.sub);
    await me.apiKeys.delete();
    // Patch to undefined removes the attribute. Use the empty-string
    // sentinel since ElectroDB `patch` won't `REMOVE` for `undefined` —
    // a follow-up could prefer DDB's UPDATE … REMOVE.
    await me.profiles.patch({ mcpApiKeyPrefix: '' });
    console.info('mcp api key revoked', { userId: claims.sub });
    return { ok: true };
  } catch (err) {
    console.error('revokeMcpKey failed', err);
    return { ok: false, message: 'Failed to revoke key.' };
  }
}
