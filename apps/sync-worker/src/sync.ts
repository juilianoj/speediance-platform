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

/**
 * Floor for "all of history" syncs when the user hasn't picked a start date
 * — Speediance launched in 2021, this is safely before any user could
 * possibly have data. The records endpoint returns [] for empty ranges so
 * over-reaching costs us one round-trip per sync.
 */
const ALL_HISTORY_START = '2018-01-01';

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

    rangeStart = profile.syncStartDate ?? ALL_HISTORY_START;

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
    // Speediance's records endpoint silently truncates / nulls-out when the
    // date range is too wide (saw `null` come back for a 7-year window).
    // Chunk into 6-month windows and concat the results. The API returns
    // [] for empty windows so this is safe over Speediance's pre-launch
    // years too.
    const records = await fetchAllRecords(client, rangeStart, rangeEnd);
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

      // ── Fetch per-exercise + per-set detail for strength workouts ──────
      //
      // Both course and custom workouts use the same endpoint shape, keyed
      // by `trainingId` (NOT `id` — that was the original wrong-ID bug).
      // For course workouts we hit `courseTrainingInfoDetail`; for custom
      // we hit `cttTrainingInfoDetail`. Cardio sessions are skipped (no
      // detail to fetch).
      if (!isCardio && rec.trainingId !== undefined) {
        try {
          const detailType = rec.courseId ? 'course' : 'custom';
          const exercises = (await client.getTrainingDetail(
            rec.trainingId as string | number,
            detailType,
          )) as Array<Record<string, unknown>>;
          if (Array.isArray(exercises)) {
            setsProcessed += await upsertExercisesAndSets(me, startTimeIso, exercises);
          }
        } catch (err) {
          // One session's detail failing shouldn't fail the whole user sync —
          // log and move on. The Workout item is already in place.
          console.warn(`getTrainingDetail failed for trainingId ${rec.trainingId}`, err);
        }

        // Tiny pause to avoid rate-limit clusters on the Speediance side.
        await new Promise((r) => setTimeout(r, 100));
      }
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
 * Pull all training records in [start, end] by chunking into 6-month
 * windows. The Speediance API returns `null` (not `[]`) for ranges it
 * can't satisfy in one response, so we treat null defensively and just
 * skip the window. Records are merged in the order returned by the API.
 */
async function fetchAllRecords(
  client: SpeedianceClient,
  startIso: string,
  endIso: string,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();
  let cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);

  while (cursor <= end) {
    const windowEnd = new Date(cursor);
    windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 6);
    if (windowEnd > end) windowEnd.setTime(end.getTime());

    const wStart = cursor.toISOString().slice(0, 10);
    const wEnd = windowEnd.toISOString().slice(0, 10);
    try {
      const chunk = (await client.getTrainingRecords(wStart, wEnd)) as unknown;
      if (Array.isArray(chunk)) {
        for (const rec of chunk) {
          if (typeof rec !== 'object' || rec === null) continue;
          const r = rec as Record<string, unknown>;
          // Dedup by (id, startTimestamp) — the API can return the same
          // record on the seam between adjacent windows.
          const key =
            r.id !== undefined
              ? `id-${r.id}`
              : `t-${r.startTimestamp ?? r.startTime ?? Math.random()}`;
          if (seenIds.has(key)) continue;
          seenIds.add(key);
          out.push(r);
        }
      }
    } catch (err) {
      console.warn(`getTrainingRecords ${wStart}..${wEnd} failed`, err);
    }

    // Step the cursor one day past the window end so the next iteration
    // doesn't re-fetch the same end day.
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * For each exercise in a workout's detail response, write one Set per
 * `finishedReps` entry and upsert the Exercise aggregate (best weight,
 * working weight, last done, total sets, name, muscle group).
 *
 * Speediance returns one exercise object per `actionLibraryGroupId` with:
 *   - actionLibraryName: human-readable exercise name
 *   - trainingPartId2: muscle group id (mapped via MUSCLE_GROUP_BY_ID)
 *   - isBarbell, isLeftRight: exercise type flags
 *   - maxWeight, oneRepMax, totalCapacity: aggregate stats for the session
 *   - score, completionScore, forceControlScore, …: 0–5 quality scores
 *   - finishedReps: [{ finishedCount, targetCount, capacity, time, …,
 *                      trainingInfoDetail: { weights, leftWeights, … } }]
 *     — one entry per "set"; bilateral has `weights`, unilateral has
 *     `leftWeights`/`rightWeights`. We pick the heaviest single rep weight
 *     as the set's `weight` so the Lift Log "max weight per set" math
 *     stays trivial; drop sets (multiple distinct weights in one entry)
 *     surface via `startWeight` / `endWeight`.
 */
async function upsertExercisesAndSets(
  me: SyncDbForUser,
  startTime: string,
  exercises: Array<Record<string, unknown>>,
): Promise<number> {
  let totalSets = 0;
  for (const ex of exercises) {
    const exerciseId = String(ex.actionLibraryGroupId ?? '').trim();
    if (!exerciseId) continue;

    const name = (ex.actionLibraryName as string | undefined) ?? `Exercise ${exerciseId}`;
    const partId = ex.trainingPartId2 as number | undefined;
    const muscleGroup = partId !== undefined ? MUSCLE_GROUP_BY_ID[partId] : undefined;
    const isUnilateral = Boolean(ex.isLeftRight);
    const finishedReps = Array.isArray(ex.finishedReps) ? ex.finishedReps : [];

    // Write one Set per finishedReps entry. setNum is 1-indexed in the
    // order Speediance returned them (which is the actual workout order).
    for (let i = 0; i < finishedReps.length; i++) {
      const rep = finishedReps[i] as Record<string, unknown>;
      const detail = (rep.trainingInfoDetail ?? {}) as Record<string, unknown>;
      const weights = pickWeightsArray(detail);
      const setWeight = weights.length > 0 ? Math.max(...weights) : undefined;
      const startWeight = weights.length > 1 ? weights[0] : undefined;
      const endWeight = weights.length > 1 ? weights[weights.length - 1] : undefined;
      const finished = pickInt(rep.finishedCount) ?? pickInt(rep.leftCount);
      const target = pickInt(rep.targetCount);
      const volume =
        setWeight !== undefined && finished !== undefined ? setWeight * finished : undefined;
      const errors = Array.isArray(rep.errorCorrectionTips)
        ? (rep.errorCorrectionTips as unknown[]).filter((n) => Number(n) > 0).map(String)
        : undefined;

      await me.sets.put({
        startTime,
        exerciseId,
        setNum: i + 1,
        weight: setWeight,
        startWeight,
        endWeight,
        targetReps: target,
        finishedReps: finished,
        volume,
        rest: pickInt(rep.time),
        mode: pickInt(detail.actionMode),
        leftRight: rep.leftRight !== undefined ? String(rep.leftRight) : undefined,
        formFlags: errors && errors.length > 0 ? errors : undefined,
      });
      totalSets++;
    }

    // Exercise aggregate: bestWeight is the running max, workingWeight is
    // the heaviest single weight from this session (per-exercise).
    const sessionMax = pickFloat(ex.maxWeight);
    const existing = (await me.exercises.get(exerciseId)) as {
      data: { bestWeight?: number; totalSets?: number } | null;
    } | null;
    const prevBest = existing?.data?.bestWeight ?? 0;
    const prevTotal = existing?.data?.totalSets ?? 0;
    await me.exercises.upsert({
      exerciseId,
      name,
      muscleGroup,
      isUnilateral,
      bestWeight: sessionMax !== undefined ? Math.max(prevBest, sessionMax) : prevBest,
      workingWeight: sessionMax,
      lastDone: startTime,
      totalSets: prevTotal + finishedReps.length,
    });
  }
  return totalSets;
}

function pickWeightsArray(detail: Record<string, unknown>): number[] {
  const candidates = [detail.weights, detail.leftWeights, detail.rightWeights];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const nums = c.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length > 0) return nums;
    }
  }
  return [];
}

function pickInt(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : undefined;
}

function pickFloat(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The subset of UserScopedDb that sync.ts pokes at. Kept narrow so the
 * function signature surfaces what storage it needs.
 */
interface SyncDbForUser {
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
      leftRight?: string;
      formFlags?: string[];
    }) => Promise<unknown>;
  };
  exercises: {
    get: (exerciseId: string) => Promise<unknown>;
    upsert: (input: {
      exerciseId: string;
      name?: string;
      muscleGroup?: string;
      isUnilateral?: boolean;
      bestWeight?: number;
      workingWeight?: number;
      lastDone?: string;
      totalSets?: number;
    }) => Promise<unknown>;
  };
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
