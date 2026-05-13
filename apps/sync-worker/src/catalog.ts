import { createDb } from '@speediance/db';
import { createSecretsStore } from '@speediance/secrets-store';
import { type SpeedianceClient } from '@speediance/speediance-client';

import { createSpeedianceClient } from './speediance-client.js';

export interface CatalogBootstrapSummary {
  ok: boolean;
  error?: string;
  /** User whose Speediance creds we used to enumerate the library. */
  driverUserId: string;
  startedAt: string;
  finishedAt: string;
  categoriesSeen: number;
  groupsDiscovered: number;
  /** Catalog rows successfully written. */
  groupsWritten: number;
  /** Groups we discovered but couldn't fetch detail for. */
  groupsFailed: number;
}

interface AccessoryRow {
  id: number;
  name: string;
}

function tableName(): string {
  const t = process.env.DYNAMO_TABLE_NAME;
  if (!t) throw new Error('DYNAMO_TABLE_NAME env var not set');
  return t;
}

function stage(): string {
  return process.env.SST_STAGE ?? 'dev';
}

/**
 * Walk every Speediance action-library category, enumerate every exercise
 * groupId, fetch full detail, and write the result to the global
 * `ExerciseCatalog` table.
 *
 * Designed to run from the sync-worker Lambda — invoke with payload
 * `{ mode: 'catalog-bootstrap', userId }`. The user is the Speediance
 * credential owner whose token we use for the API enumeration; in
 * practice this is the platform admin (Jeff). Other users will read the
 * cache without needing their own auth path.
 *
 * Idempotent: re-running overwrites rows in-place. Use this to refresh
 * the catalog after Speediance updates the library.
 */
export async function bootstrapExerciseCatalog(
  driverUserId: string,
): Promise<CatalogBootstrapSummary> {
  const startedAt = new Date().toISOString();
  const summary: CatalogBootstrapSummary = {
    ok: true,
    driverUserId,
    startedAt,
    finishedAt: '',
    categoriesSeen: 0,
    groupsDiscovered: 0,
    groupsWritten: 0,
    groupsFailed: 0,
  };

  try {
    const secrets = createSecretsStore({ stage: stage() });
    const secret = await secrets.get(driverUserId);
    if (!secret) throw new Error(`no Speediance creds for ${driverUserId}`);
    const client = createSpeedianceClient(driverUserId, secret, secrets);
    const db = createDb({ tableName: tableName() });

    // 1. Pull the accessories lookup once — we'll use it to resolve the
    //    comma-string `accessories` field on each exercise to human-readable
    //    names ("Barbell", "Handles", "30°-incline-bench") that the UI can
    //    show directly. Cheaper than a lookup table on every read.
    const accessories = (await unsafeReq(client, '/api/app/accessories/list')) as
      | AccessoryRow[]
      | null;
    const accessoryById = new Map<string, string>();
    for (const a of accessories ?? []) {
      if (typeof a?.id === 'number' && typeof a?.name === 'string') {
        accessoryById.set(String(a.id), a.name);
      }
    }
    console.info(`catalog bootstrap: ${accessoryById.size} accessories cached`);

    // 2. Enumerate every exercise via the paginated `actionLibraryGroup/page`
    //    endpoint. The actionLibraryTab/list endpoint returns just the
    //    top-level category tabs (Training, Customized, etc.) — it doesn't
    //    embed the actual exercises. `page` is the right enumeration: max
    //    pageSize is ~885 today, so two pages of 500 covers everything.
    //    Loop defensively in case Speediance ever ships more.
    const PAGE_SIZE = 500;
    const groupIds = new Set<number>();
    for (let pageNo = 1; pageNo <= 20; pageNo++) {
      const pageResp = (await unsafeReq(
        client,
        `/api/app/actionLibraryGroup/page?pageNo=${pageNo}&pageSize=${PAGE_SIZE}&deviceType=${secret.deviceType}`,
      )) as Array<{ id?: number }> | null;
      if (!Array.isArray(pageResp) || pageResp.length === 0) break;
      for (const row of pageResp) {
        if (typeof row?.id === 'number' && Number.isFinite(row.id)) groupIds.add(row.id);
      }
      // Stop early if this page is short of the requested size — means we've
      // exhausted the list.
      if (pageResp.length < PAGE_SIZE) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // categoriesSeen is now a count of API enumeration pages we walked, not
    // tab categories. Keeping the field name for backwards-compat on the
    // summary type; the meaning is "API pages fetched".
    summary.categoriesSeen = Math.ceil(groupIds.size / PAGE_SIZE);
    summary.groupsDiscovered = groupIds.size;
    console.info(`catalog bootstrap: discovered ${groupIds.size} unique groupIds`);

    // 3. Fetch detail per groupId, batched in chunks of 25 (Speediance's
    //    `actionLibraryGroup/list?ids=...` accepts batched ids and returns
    //    array responses, so we get round-trip efficiency vs N single
    //    requests). 100ms delay between batches keeps us politely under
    //    Speediance's rate limit.
    const idsList = [...groupIds];
    const BATCH = 25;
    const rows: Array<NonNullable<ReturnType<typeof parseCatalogRow>>> = [];
    for (let i = 0; i < idsList.length; i += BATCH) {
      const slice = idsList.slice(i, i + BATCH);
      const idsParam = slice.map((id) => `ids=${id}`).join('&');
      try {
        const batch = (await unsafeReq(
          client,
          `/api/app/actionLibraryGroup/list?${idsParam}`,
        )) as Array<Record<string, unknown>> | null;
        if (Array.isArray(batch)) {
          for (const raw of batch) {
            const row = parseCatalogRow(raw, accessoryById);
            if (row) rows.push(row);
            else summary.groupsFailed++;
          }
        }
      } catch (err) {
        console.warn(`batch ${i}..${i + slice.length} failed`, err);
        summary.groupsFailed += slice.length;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // 4. Bulk-write to DDB. ElectroDB's bulk-put fans out to BatchWrite
    //    (25 items per request) automatically.
    if (rows.length > 0) {
      // Chunked manually too so a single failure doesn't blow up the
      // whole bootstrap.
      const WRITE_CHUNK = 25;
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
        const slice = rows.slice(i, i + WRITE_CHUNK);
        try {
          // bulkUpsert's input shape is the ElectroDB CreateEntityItem; our
          // parser builds a structurally-identical object but TypeScript
          // can't prove the equivalence through the index-signature return
          // type. Safe to cast since required fields (groupId,
          // speedianceCachedAt) are guaranteed present.
          await db.global.exerciseCatalog.bulkUpsert(
            slice as unknown as Parameters<typeof db.global.exerciseCatalog.bulkUpsert>[0],
          );
          summary.groupsWritten += slice.length;
        } catch (err) {
          console.warn(`write chunk ${i} failed`, err);
        }
      }
    }
  } catch (err) {
    summary.ok = false;
    summary.error = err instanceof Error ? err.message : String(err);
    console.error('catalog bootstrap failed', err);
  }

  summary.finishedAt = new Date().toISOString();
  console.info('CatalogBootstrap', summary);
  return summary;
}

/**
 * Convert one raw Speediance action-library response into our ExerciseCatalog
 * row. Returns null if the response is too malformed to use (missing id,
 * etc.).
 */
function parseCatalogRow(
  raw: Record<string, unknown>,
  accessoryNames: Map<string, string>,
): { [k: string]: unknown } | null {
  const id = typeof raw.id === 'number' ? raw.id : undefined;
  if (id === undefined) return null;

  const accessoryIds =
    typeof raw.accessories === 'string'
      ? raw.accessories
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

  const formCues: string[] = [];
  for (let i = 2; i <= 6; i++) {
    const txt = raw[`guideVoice${i}Txt`];
    if (typeof txt === 'string' && txt.length > 0) formCues.push(txt);
  }

  const muscleNames = (raw.mainMuscleGroupList ?? raw.primaryMuscleList) as unknown;
  const primaryMuscles = extractMuscleNames(muscleNames);
  const auxiliaryMuscles = extractMuscleNames(raw.auxiliaryMuscleGroupList);

  const variantList = raw.actionLibraryList as Array<{ id?: number }> | undefined;
  const defaultVariantId =
    Array.isArray(variantList) && typeof variantList[0]?.id === 'number'
      ? variantList[0]!.id
      : undefined;

  return {
    groupId: String(id),
    name: typeof raw.title === 'string' ? raw.title : undefined,
    description: typeof raw.context === 'string' ? raw.context : undefined,
    muscleGroup:
      typeof raw.mainMuscleGroupName === 'string'
        ? String(raw.mainMuscleGroupName).toLowerCase()
        : undefined,
    primaryMuscles: primaryMuscles.length > 0 ? primaryMuscles : undefined,
    auxiliaryMuscles: auxiliaryMuscles.length > 0 ? auxiliaryMuscles : undefined,
    outPosition: typeof raw.outPosition === 'number' ? raw.outPosition : undefined,
    accessoryIds: accessoryIds.length > 0 ? accessoryIds : undefined,
    accessoryNames:
      accessoryIds.length > 0
        ? accessoryIds.map((i) => accessoryNames.get(i) ?? `accessory#${i}`)
        : undefined,
    benchAngle:
      typeof raw.foldingStoolAngle === 'string' && raw.foldingStoolAngle.length > 0
        ? raw.foldingStoolAngle
        : undefined,
    isBarbell: raw.isBarbell === 1,
    isUnilateral: raw.isLeftRight === 1,
    usesDevice: raw.isUseDevice === 1,
    setupInstructions:
      typeof raw.guideVoice1Txt === 'string' && raw.guideVoice1Txt.length > 0
        ? raw.guideVoice1Txt
        : undefined,
    formCues: formCues.length > 0 ? formCues : undefined,
    difficulty: typeof raw.difficultyId === 'number' ? raw.difficultyId : undefined,
    metValue: typeof raw.metValue === 'number' ? raw.metValue : undefined,
    recommendedWeight:
      typeof raw.recommendedWeight === 'number' ? raw.recommendedWeight : undefined,
    weightRatio: typeof raw.weightRatio === 'number' ? raw.weightRatio : undefined,
    defaultVariantId,
    speedianceCachedAt: new Date().toISOString(),
  };
}

function extractMuscleNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const name = m.muscleGroupName ?? m.name ?? m.categoryName;
    if (typeof name === 'string' && name.length > 0) out.push(name);
  }
  return out;
}

/**
 * Hatch into the SpeedianceClient's private `req` for arbitrary endpoints.
 * Same trick the sync.ts already uses — the public methods don't yet cover
 * the action-library-tab + accessories endpoints we need here.
 */
async function unsafeReq<T>(client: SpeedianceClient, path: string): Promise<T> {
  const r = client as unknown as { req: <U>(m: string, p: string) => Promise<U> };
  return r.req<T>('GET', path);
}
