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
 * search / filter / candidate-selection logic. With ~500 rows and ~1KB
 * each (no images / videos), this is ~0.5MB — fine for a single request.
 *
 * React's `cache()` dedupes calls within one server render so the
 * builder page can hit `listExercises()` from multiple components without
 * re-querying DDB.
 */
export const listExercises = cache(async (): Promise<CatalogExercise[]> => {
  const db = dbOrNull();
  if (!db) return [];
  const res = (await db.global.exerciseCatalog.list()) as { data: CatalogRow[] };
  return (res.data ?? []).map(toCatalogExercise).sort((a, b) => a.name.localeCompare(b.name));
});
