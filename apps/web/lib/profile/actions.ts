'use server';

import 'server-only';

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
    unit: formData.get('unit'),
    syncStartDate: formData.get('syncStartDate') || undefined,
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
    await me.profiles.upsert({
      email: claims.email,
      bodyweight: input.bodyweight,
      unit: input.unit,
      region: input.region,
      deviceType: input.deviceType,
      allowMonsterMoves: input.allowMonsterMoves,
      syncStartDate: input.syncStartDate,
      speedianceSecretArn: secretArn,
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
