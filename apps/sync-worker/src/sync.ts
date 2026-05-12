import { createDb } from '@speediance/db';
import {
  createSecretsStore,
  SpeedianceSecretSchema,
  type SpeedianceSecret,
} from '@speediance/secrets-store';
import { SpeedianceClient, type Credentials } from '@speediance/speediance-client';

export interface SyncSummary {
  userId: string;
  ok: boolean;
  workoutsProcessed: number;
  setsProcessed: number;
  error?: string;
  startedAt: string;
  finishedAt: string;
  rangeStart: string;
  rangeEnd: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMinusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function stage(): string {
  return process.env.SST_STAGE ?? 'dev';
}

function tableName(): string {
  const t = process.env.DYNAMO_TABLE_NAME;
  if (!t) throw new Error('DYNAMO_TABLE_NAME env var not set');
  return t;
}

interface ProfileLite {
  userId: string;
  syncStartDate?: string;
  speedianceSecretArn?: string;
  lastSyncedAt?: string;
}

/**
 * Scan the table for all PROFILE items. With 5 family users this is a tiny
 * scan; if it ever grows we'll add a sparse GSI on `pk=PROFILES`/`sk=userId`.
 */
async function listProfiles(): Promise<ProfileLite[]> {
  const db = createDb({ tableName: tableName() });
  // Use the underlying service entity to scan profiles — go() returns the
  // full set with continuation-token handling baked in.
  const result = (await db.service.entities.profiles.scan.go({ pages: 'all' })) as {
    data: Array<{ userId: string; syncStartDate?: string; speedianceSecretArn?: string }>;
  };
  return result.data.map((p) => ({
    userId: p.userId,
    syncStartDate: p.syncStartDate,
    speedianceSecretArn: p.speedianceSecretArn,
  }));
}

/**
 * Sync every profile that has Speediance creds wired up. Serialised with
 * a 2-second delay between users so we don't hammer the Speediance API.
 */
export async function syncAllUsers(): Promise<SyncSummary[]> {
  const profiles = await listProfiles();
  const targets = profiles.filter((p) => p.speedianceSecretArn);
  console.info(`syncAllUsers: ${profiles.length} profiles, ${targets.length} with creds`);

  const summaries: SyncSummary[] = [];
  for (const p of targets) {
    summaries.push(await syncUser(p.userId));
    await new Promise((r) => setTimeout(r, 2000));
  }
  return summaries;
}

/**
 * Sync one user's Speediance training history into DynamoDB. Idempotent —
 * re-running over the same range overwrites Workout / Set items with the
 * same key. Token rotation is automatic: on 401 we re-login and write the
 * new token back to Secrets Manager.
 */
export async function syncUser(userId: string): Promise<SyncSummary> {
  const startedAt = new Date().toISOString();
  const db = createDb({ tableName: tableName() });
  const me = db.forUser(userId);
  const secrets = createSecretsStore({ stage: stage() });

  let workoutsProcessed = 0;
  let setsProcessed = 0;
  let rangeStart = '';
  const rangeEnd = todayIso();
  let ok = true;
  let errorMsg: string | undefined;

  try {
    // -- 1. Load profile + secret
    const profileResult = (await me.profiles.get()) as { data: ProfileLite | null } | null;
    const profile = profileResult?.data;
    if (!profile) throw new Error('profile not found');

    const secret = await secrets.get(userId);
    if (!secret) throw new Error('no Speediance credentials in Secrets Manager');

    rangeStart = profile.syncStartDate ?? isoMinusDays(30);

    // -- 2. Init client with re-login-on-401 hook
    const client = createSpeedianceClient(userId, secret, secrets);

    // -- 3. Pull training records in the window
    const records = (await client.getTrainingRecords(rangeStart, rangeEnd)) as Array<{
      id: number | string;
      trainingType?: string;
      startTime?: number | string;
      templateName?: string;
      templateCode?: string | number;
      duration?: number;
      totalCapacity?: number;
      calorie?: number;
      deviceType?: number;
    }>;
    console.info(
      `syncUser ${userId}: ${records.length} training records in ${rangeStart}..${rangeEnd}`,
    );

    // -- 4. For each session, fetch details + upsert workout + sets
    for (const rec of records) {
      const startTimeIso = toIsoTimestamp(rec.startTime);
      if (!startTimeIso) continue;
      const weekIso = thursdayOfIsoWeek(new Date(startTimeIso));
      const trainingType = (rec.trainingType ?? 'custom') as 'course' | 'custom';

      await me.workouts.put({
        startTime: startTimeIso,
        templateCode: rec.templateCode ? String(rec.templateCode) : undefined,
        title: rec.templateName,
        durationSeconds: rec.duration,
        totalCapacity: rec.totalCapacity,
        calories: rec.calorie,
        deviceType: rec.deviceType,
        weekIso,
        completed: true,
        speedianceTrainingId: String(rec.id),
        speedianceTrainingType: trainingType,
      });
      workoutsProcessed++;

      try {
        const detail = (await client.getTrainingDetail(rec.id, trainingType)) as Record<
          string,
          unknown
        >;
        setsProcessed += await upsertSetsFromDetail(me, startTimeIso, detail);
      } catch (err) {
        // One session's detail failing shouldn't fail the whole user sync —
        // log and move on. The Workout item is already in place.
        console.warn(`getTrainingDetail failed for ${rec.id}`, err);
      }

      // Tiny pause to avoid rate-limit clusters.
      await new Promise((r) => setTimeout(r, 100));
    }

    // -- 5. Mark profile synced
    await me.profiles.upsert({
      // upsert is full-record put; carry over the values we know are stable
      email: undefined,
      syncStartDate: profile.syncStartDate,
      speedianceSecretArn: profile.speedianceSecretArn,
      // Note: we don't track lastSyncedAt on the Profile entity yet — the
      // SyncRun audit item below is the source of truth. Future enhancement.
    });
  } catch (err) {
    ok = false;
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`syncUser ${userId} failed`, err);
  }

  const finishedAt = new Date().toISOString();
  const summary: SyncSummary = {
    userId,
    ok,
    workoutsProcessed,
    setsProcessed,
    error: errorMsg,
    startedAt,
    finishedAt,
    rangeStart,
    rangeEnd,
  };
  await writeAudit(summary);
  return summary;
}

/**
 * Build a SpeedianceClient with the user's stored creds + an `onUnauthorized`
 * hook that re-logs in and persists the fresh token to Secrets Manager.
 * The Speediance API only permits one active session per account, so we
 * deliberately reuse the persisted token until it's actually invalid.
 */
function createSpeedianceClient(
  userId: string,
  secret: SpeedianceSecret,
  secretsApi: ReturnType<typeof createSecretsStore>,
): SpeedianceClient {
  const credentials: Credentials | null =
    secret.token && secret.appUserId
      ? {
          userId: secret.appUserId,
          token: secret.token,
          region: secret.region,
          unit: 0,
          deviceType: secret.deviceType,
          allowMonsterMoves: secret.allowMonsterMoves,
        }
      : null;

  const client = new SpeedianceClient(credentials, {
    region: secret.region,
    deviceType: secret.deviceType,
    allowMonsterMoves: secret.allowMonsterMoves,
    async onUnauthorized() {
      console.info(`onUnauthorized: re-logging in for ${userId}`);
      try {
        const login = await client.login(secret.email, secret.password);
        if (!login.ok || !login.credentials) {
          console.error(`re-login failed for ${userId}: ${login.reason}`);
          return false;
        }
        // Persist the fresh token; on next invocation we skip the re-login.
        const refreshed = SpeedianceSecretSchema.parse({
          ...secret,
          token: login.credentials.token,
          appUserId: login.credentials.userId,
          tokenAcquiredAt: new Date().toISOString(),
        });
        await secretsApi.put(userId, refreshed);
        return true;
      } catch (err) {
        console.error(`re-login threw for ${userId}`, err);
        return false;
      }
    },
  });
  return client;
}

interface DbForUser {
  sets: {
    put: (input: {
      startTime: string;
      exerciseId: string;
      setNum: number;
      weight?: number;
      startWeight?: number;
      endWeight?: number;
      targetReps?: number;
      finishedReps?: number;
      volume?: number;
      rest?: number;
      mode?: number;
      unit?: string;
      leftRight?: string;
      formFlags?: string[];
    }) => Promise<unknown>;
  };
}

/**
 * Walks the getTrainingDetail response and writes one Set item per set.
 * The shape varies between course and custom workouts — defensive: skip
 * anything that doesn't match the expected layout.
 */
async function upsertSetsFromDetail(
  me: DbForUser,
  startTime: string,
  detail: Record<string, unknown>,
): Promise<number> {
  const exercises =
    (detail.actionLibraryList as unknown[] | undefined) ??
    (detail.actionList as unknown[] | undefined) ??
    [];
  if (!Array.isArray(exercises)) return 0;

  let count = 0;
  for (const ex of exercises) {
    if (typeof ex !== 'object' || ex === null) continue;
    const e = ex as Record<string, unknown>;
    const exerciseId = String(e.groupId ?? e.actionLibraryId ?? e.id ?? '').trim();
    if (!exerciseId) continue;

    const reps = csv(e.setsAndReps);
    const weights = csv(e.weights);
    const breaks = csv(e.breakTime ?? e.breakTime2);
    const modes = csv(e.sportMode);
    const leftRight = csv(e.leftRight);
    const finished = csv(e.completionCount);
    const formFlags = csv(e.errorCorrectionTips);

    const setCount = Math.max(reps.length, weights.length, finished.length);
    for (let i = 0; i < setCount; i++) {
      const targetReps = num(reps[i]);
      const finishedReps = num(finished[i]) ?? targetReps;
      const weight = num(weights[i]);
      const volume =
        finishedReps !== undefined && weight !== undefined ? finishedReps * weight : undefined;
      const flag = formFlags[i];
      await me.sets.put({
        startTime,
        exerciseId,
        setNum: i + 1,
        weight,
        targetReps,
        finishedReps,
        volume,
        rest: num(breaks[i]),
        mode: num(modes[i]),
        leftRight: leftRight[i],
        formFlags: flag ? [flag] : undefined,
      });
      count++;
    }
  }
  return count;
}

function csv(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toIsoTimestamp(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/**
 * ISO 8601 week is anchored on Thursday. Returns the YYYY-MM-DD of the
 * Thursday for the given date's ISO week (UTC). Used as the AGG#WEEK#
 * partition and the GSI2 range key.
 */
function thursdayOfIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek); // shift to Thursday
  return date.toISOString().slice(0, 10);
}

async function writeAudit(summary: SyncSummary): Promise<void> {
  try {
    // Audit items are SyncRun#{startedAt} under the user's PK. Using ad-hoc
    // DDB writes via the underlying client would require widening packages/db's
    // surface; for the audit log we just log to CloudWatch and call it done.
    // A proper audit entity arrives when the admin page (Phase 1.8) needs to
    // surface it.
    console.info('SyncRun', summary);
  } catch (err) {
    console.warn('audit write failed', err);
  }
}
