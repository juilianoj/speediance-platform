import 'server-only';

import {
  createSecretsStore,
  SpeedianceSecretSchema,
  type SpeedianceSecret,
} from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

/**
 * Build a SpeedianceClient suitable for use from a Next.js server component
 * or server action. Mirrors the sync worker's pattern: on a `code:91` /
 * HTTP 401 from Speediance, re-log in using the stored email+password,
 * persist the fresh token back to Secrets Manager, and retry the call.
 *
 * Why this matters here (and not just in the sync worker): the Speediance
 * API only permits one active session per account. Any of these can rotate
 * the active token out from under us —
 *   - The user logs in on their phone.
 *   - The sync worker re-logs in (e.g. its previous token got rotated).
 *   - Another browser tab triggers a refresh.
 * Without `onUnauthorized`, the dashboard's calls to
 * `getCalendarPlanned` / `getCourseDetail` silently fail with empty
 * results, which surfaces as "scheduled days disappear" / "next session
 * defaults to the most-recent completed workout" — a regression Jeff has
 * been hitting intermittently.
 *
 * Returns null when no creds are wired up for the user (caller should
 * treat as "Speediance not connected" and fall back appropriately).
 */
export async function createRefreshingSpeedianceClient(
  userId: string,
): Promise<SpeedianceClient | null> {
  const stage = process.env.SST_STAGE ?? 'dev';
  const secretsApi = createSecretsStore({ stage });
  const initial = await secretsApi.get(userId);
  if (!initial?.token || !initial.appUserId) return null;

  // Mutable holder so the onUnauthorized hook can read the freshest creds
  // it has persisted (avoids re-logging in twice in a row when the same
  // client makes back-to-back calls after a token rotation). The schema
  // has token + appUserId as optional, so re-narrow on every read.
  let secret: SpeedianceSecret & { token: string; appUserId: string } = {
    ...initial,
    token: initial.token,
    appUserId: initial.appUserId,
  };

  const creds: Credentials = {
    userId: secret.appUserId,
    token: secret.token,
    region: secret.region,
    unit: 0,
    deviceType: secret.deviceType,
    allowMonsterMoves: secret.allowMonsterMoves,
  };

  // Dedupe in-flight token refreshes. The dashboard fires ~6 Speediance
  // calls in parallel (loadScheduledWorkouts hits monthNew + month for
  // 3 months at a time). When the stored token is stale, every one of
  // those calls 401s and independently invokes `onUnauthorized` —
  // without this dedupe, 6 concurrent `client.login()` calls hit
  // Speediance, and because Speediance only permits ONE active session
  // per account each login invalidates the previous. The retries then
  // race against a moving token and most of them get re-401'd, falling
  // back to empty arrays. Result: "Next session" disappears until a
  // manual sync writes a fresh token from a single-call context.
  //
  // The shared promise pattern collapses N concurrent refresh requests
  // into one login → one token write → N retries with a stable token.
  let pendingRefresh: Promise<boolean> | null = null;

  const client = new SpeedianceClient(creds, {
    region: secret.region,
    deviceType: secret.deviceType,
    allowMonsterMoves: secret.allowMonsterMoves,
    async onUnauthorized() {
      if (pendingRefresh) {
        console.info(`web onUnauthorized: awaiting in-flight refresh for ${userId}`);
        return pendingRefresh;
      }
      console.info(`web onUnauthorized: re-logging in for ${userId}`);
      pendingRefresh = (async () => {
        try {
          const login = await client.login(secret.email, secret.password);
          if (!login.ok || !login.credentials) {
            console.error(`web re-login failed for ${userId}: ${login.reason}`);
            return false;
          }
          const refreshed = SpeedianceSecretSchema.parse({
            ...secret,
            token: login.credentials.token,
            appUserId: login.credentials.userId,
            tokenAcquiredAt: new Date().toISOString(),
          });
          secret = {
            ...refreshed,
            token: login.credentials.token,
            appUserId: login.credentials.userId,
          };
          await secretsApi.put(userId, refreshed);
          return true;
        } catch (err) {
          console.error(`web re-login threw for ${userId}`, err);
          return false;
        } finally {
          // Clear AFTER all awaiters resolve so a subsequent 401 in a
          // long-lived request triggers a fresh login rather than
          // returning a stale `true` from the cleared slot.
          pendingRefresh = null;
        }
      })();
      return pendingRefresh;
    },
  });
  return client;
}
