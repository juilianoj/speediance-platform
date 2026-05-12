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
  /** Set-level sync is paused until the detail endpoint is reverse-engineered;
   *  kept in the summary shape so the audit log doesn't change schema yet. */
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
    //
    // Field names map (Speediance API → our schema):
    //   id            → speedianceTrainingId (workout instance, absent on cardio)
    //   trainingId    → speedianceTrainingTemplateId (per-session template)
    //   title         → title
    //   trainingTime  → durationSeconds
    //   calorie       → calories
    //   totalCapacity → totalCapacity (strength volume)
    //   totalEnergy   → outputJoules (the "Output" KPI in the spreadsheet)
    //   mileage       → distanceMiles (cardio)
    //   sportType     → sportType (cardio activity id; 39 ≈ walking)
    //   courseId      → courseId (for grouping "same course, many sessions")
    //   trainingPartSetsInfoList → muscleGroupSets (mapped to named groups)
    //
    // Earlier versions of this worker assumed `templateName`/`duration`/
    // `calories` field names; those don't exist on the response, so every
    // workout was being saved with title/duration/output as undefined.
    const records = (await client.getTrainingRecords(rangeStart, rangeEnd)) as Array<
      Record<string, unknown>
    >;
    console.info(
      `syncUser ${userId}: ${records.length} training records in ${rangeStart}..${rangeEnd}`,
    );

    for (const rec of records) {
      const startTimeIso = toIsoTimestamp(rec.startTime as number | string | undefined);
      if (!startTimeIso) continue;
      const weekIso = thursdayOfIsoWeek(new Date(startTimeIso));

      const hasInstanceId = rec.id !== undefined && rec.id !== null;
      const isCardio = !hasInstanceId || (rec.sportType !== undefined && !rec.courseId);

      await me.workouts.put({
        startTime: startTimeIso,
        title: (rec.title as string | undefined) ?? cardioTitle(rec),
        durationSeconds: numField(rec.trainingTime),
        totalCapacity: numField(rec.totalCapacity),
        outputJoules: numField(rec.totalEnergy),
        calories: numField(rec.calorie),
        distanceMiles: numField(rec.mileage),
        sportType: numField(rec.sportType),
        isCardio,
        deviceType: numField(rec.deviceType),
        muscleGroupSets: mapMuscleGroupSets(rec.trainingPartSetsInfoList),
        weekIso,
        completed: true,
        speedianceTrainingId: hasInstanceId ? String(rec.id) : undefined,
        speedianceTrainingTemplateId:
          rec.trainingId !== undefined ? String(rec.trainingId) : undefined,
        speedianceTrainingType: isCardio ? 'cardio' : rec.courseId ? 'course' : 'custom',
        courseId: numField(rec.courseId),
        courseCategoryName: rec.courseCategoryName as string | undefined,
      });
      workoutsProcessed++;

      // NB: getTrainingDetail is currently disabled — the upstream endpoints
      // return inconsistent shapes depending on `id` vs `trainingId` vs
      // `courseId`, and our exercise/set schema doesn't yet model that
      // reliably. Muscle-group set counts come from the records response
      // instead (the `trainingPartSetsInfoList` field), which is enough for
      // every chart on the current dashboard. Re-enable when the detail
      // endpoint is reverse-engineered properly (TODO Phase 1.x).
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

/**
 * Cast an unknown API field to a finite number, or undefined. Speediance
 * sometimes returns 0 for "not applicable" (e.g. mileage=0 for strength
 * workouts) — we preserve those so the dashboard can distinguish "no value"
 * from "explicitly zero".
 */
function numField(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Speediance's `trainingPartId2` IDs aren't documented anywhere we can find.
 * Mapping was reverse-engineered by lining workout titles ("chest training",
 * "back training", "arms training") up against which IDs appeared. If a
 * given workout maps an unknown ID, we drop it on the floor rather than
 * blocking the sync — the dashboard caption acknowledges this is best-guess.
 */
const MUSCLE_GROUP_BY_ID: Record<number, keyof MuscleGroupSets> = {
  11: 'chest',
  12: 'shoulders',
  13: 'back',
  14: 'core',
  15: 'legs',
  16: 'arms',
};

interface MuscleGroupSets {
  chest?: number;
  shoulders?: number;
  back?: number;
  core?: number;
  legs?: number;
  arms?: number;
}

function mapMuscleGroupSets(raw: unknown): MuscleGroupSets | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MuscleGroupSets = {};
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { trainingPartId2?: unknown; sets?: unknown };
    const partId = typeof e.trainingPartId2 === 'number' ? e.trainingPartId2 : undefined;
    const sets = typeof e.sets === 'number' ? e.sets : undefined;
    const group = partId !== undefined ? MUSCLE_GROUP_BY_ID[partId] : undefined;
    if (!group || sets === undefined) continue;
    out[group] = (out[group] ?? 0) + sets;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Speediance's cardio records (walks, runs) come back without a `title`.
 * Synthesise something useful for the recent-sessions row so it isn't blank.
 */
function cardioTitle(rec: Record<string, unknown>): string | undefined {
  if (rec.sportType === 39) return 'Walk';
  if (rec.sportType === 38) return 'Run';
  if (typeof rec.physicalTrainingType === 'number') return `Cardio (${rec.physicalTrainingType})`;
  return undefined;
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
