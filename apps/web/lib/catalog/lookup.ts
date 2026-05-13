import 'server-only';

import { cache } from 'react';

import { createDb } from '@speediance/db';

/**
 * What the rest of the app sees when it asks about an exercise. Subset
 * of the full `ExerciseCatalog` row, picked for the workout-builder + UI
 * use cases — drop anything the UI shouldn't care about.
 */
export interface CatalogExercise {
  groupId: string;
  name: string;
  description?: string;
  muscleGroup?: string;
  primaryMuscles?: string[];
  auxiliaryMuscles?: string[];
  outPosition?: number;
  accessoryIds?: string[];
  accessoryNames?: string[];
  benchAngle?: string;
  isBarbell?: boolean;
  isUnilateral?: boolean;
  usesDevice?: boolean;
  setupInstructions?: string;
  formCues?: string[];
  difficulty?: number;
  metValue?: number;
  recommendedWeight?: number;
  weightRatio?: number;
  defaultVariantId?: number;
  /**
   * `(outPosition, accessoryIds-sorted)` tuple stringified. Use as the
   * grouping key in the workout-builder's transition-minimization algo.
   */
  equipmentKey: string;
}

interface CatalogRow {
  groupId: string;
  name?: string;
  description?: string;
  muscleGroup?: string;
  primaryMuscles?: string[];
  auxiliaryMuscles?: string[];
  outPosition?: number;
  accessoryIds?: string[];
  accessoryNames?: string[];
  benchAngle?: string;
  isBarbell?: boolean;
  isUnilateral?: boolean;
  usesDevice?: boolean;
  setupInstructions?: string;
  formCues?: string[];
  difficulty?: number;
  metValue?: number;
  recommendedWeight?: number;
  weightRatio?: number;
  defaultVariantId?: number;
}

function dbOrNull() {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  return tableName ? createDb({ tableName }) : null;
}

function toCatalogExercise(row: CatalogRow): CatalogExercise {
  const sortedIds = [...(row.accessoryIds ?? [])].sort();
  return {
    groupId: row.groupId,
    name: row.name ?? `Exercise ${row.groupId}`,
    description: row.description,
    muscleGroup: row.muscleGroup,
    primaryMuscles: row.primaryMuscles,
    auxiliaryMuscles: row.auxiliaryMuscles,
    outPosition: row.outPosition,
    accessoryIds: row.accessoryIds,
    accessoryNames: row.accessoryNames,
    benchAngle: row.benchAngle,
    isBarbell: row.isBarbell,
    isUnilateral: row.isUnilateral,
    usesDevice: row.usesDevice,
    setupInstructions: row.setupInstructions,
    formCues: row.formCues,
    difficulty: row.difficulty,
    metValue: row.metValue,
    recommendedWeight: row.recommendedWeight,
    weightRatio: row.weightRatio,
    defaultVariantId: row.defaultVariantId,
    equipmentKey: `${row.outPosition ?? '?'}|${sortedIds.join(',')}|${row.benchAngle ?? ''}`,
  };
}

/**
 * Look up one exercise by groupId. Returns the cached row if we have it,
 * otherwise returns null — callers should treat a miss as "unknown
 * exercise" rather than triggering a Speediance API call on the UI hot
 * path. The bootstrap job populates ~500 exercises; on rare misses, run
 * the bootstrap again from /admin.
 *
 * (Future: lazy fetch from Speediance if missing. Punted to keep the
 * runtime path free of external dependencies. The bootstrap covers
 * every active-library exercise so misses should be near-zero.)
 */
export const getExercise = cache(async (groupId: string): Promise<CatalogExercise | null> => {
  const db = dbOrNull();
  if (!db) return null;
  const res = (await db.global.exerciseCatalog.get(groupId)) as { data: CatalogRow | null };
  return res?.data ? toCatalogExercise(res.data) : null;
});

/**
 * Load the entire catalog into memory. Used by the workout builder for
 * search / filter / candidate-selection logic. With ~885 rows and ~1KB
 * each (no images / videos), this is ~1MB — fine for a single request.
 *
 * Cached at the module level for the Lambda's warm lifetime, not per
 * render. The catalog only changes when the bootstrap job re-runs from
 * /admin, so re-scanning DDB on every coach turn was wasting ~1–2s and
 * pushing builder prompts past the CloudFront 60s origin timeout. A warm
 * Lambda will hit DDB once, then serve subsequent requests from memory.
 * Cold starts still pay the scan cost, which is fine (Lambda init shows
 * up in CloudWatch as init-duration, not request duration).
 *
 * The TTL caps staleness if a bootstrap runs between turns — at 10 min,
 * users will see fresh catalog data on their next slow path. `cache()`
 * still wraps the inner function so multiple parallel callers within one
 * request share a single Promise.
 */
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { value: CatalogExercise[]; expiresAt: number } | null = null;
let inflightCatalog: Promise<CatalogExercise[]> | null = null;

export const listExercises = cache(async (): Promise<CatalogExercise[]> => {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.value;
  }
  if (inflightCatalog) return inflightCatalog;

  const db = dbOrNull();
  if (!db) return [];
  inflightCatalog = (async () => {
    const res = (await db.global.exerciseCatalog.list()) as { data: CatalogRow[] };
    const value = (res.data ?? [])
      .map(toCatalogExercise)
      .sort((a, b) => a.name.localeCompare(b.name));
    catalogCache = { value, expiresAt: Date.now() + CATALOG_TTL_MS };
    return value;
  })();
  try {
    return await inflightCatalog;
  } finally {
    inflightCatalog = null;
  }
});
