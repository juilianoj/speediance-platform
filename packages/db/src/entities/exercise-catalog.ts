import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Cached Speediance action-library entries. Unlike the per-user `Exercise`
 * aggregate (which holds the user's lifetime stats for an exercise),
 * `ExerciseCatalog` is a global snapshot of Speediance's exercise metadata —
 * setup instructions, equipment configuration, muscle groups, etc.
 *
 * Keys
 *   PK = CATALOG#EXERCISES
 *   SK = EXERCISE#{groupId}
 *
 * Global (not user-scoped) — every user shares the same catalog because
 * Speediance ships the same library for every account. We deliberately
 * DO NOT cache user-specific fields (`bestOneRepMax`, `myRecommendedWeight2`)
 * — those live on the per-user `Exercise` entity.
 *
 * Lifecycle:
 *   - Bootstrap: a one-time enumeration of every exercise in the action
 *     library (~500 entries) populates the catalog from Jeff's Speediance
 *     creds. Runs via the sync-worker Lambda with a special payload.
 *   - Lazy refresh: when the workout-builder UI references a groupId we
 *     haven't seen, fetch it inline and write to DDB.
 *   - Periodic refresh: TBD (Speediance occasionally adds exercises or
 *     tweaks setup text). For now, bootstrap is manual via /admin.
 *
 * Why this matters: the device-config-aware workout builder needs fast
 * local access to outPosition + accessories + benchAngle for every exercise
 * it considers. Hitting the Speediance API on every UI interaction is too
 * slow + flaky. The catalog gives us local lookup with no external
 * dependency.
 */
export function exerciseCatalogEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'exerciseCatalog', service: 'speediance', version: '1' },
      attributes: {
        groupId: { type: 'string', required: true, readOnly: true },
        // Identification + display
        name: { type: 'string' },
        description: { type: 'string' },
        muscleGroup: { type: 'string' },
        primaryMuscles: { type: 'list', items: { type: 'string' } },
        auxiliaryMuscles: { type: 'list', items: { type: 'string' } },
        // Equipment / device configuration (the headline data — drives the
        // workout-builder's transition-minimization logic)
        outPosition: { type: 'number' },
        accessoryIds: { type: 'list', items: { type: 'string' } },
        accessoryNames: { type: 'list', items: { type: 'string' } },
        benchAngle: { type: 'string' },
        isBarbell: { type: 'boolean' },
        isUnilateral: { type: 'boolean' },
        usesDevice: { type: 'boolean' },
        // Coaching / setup
        setupInstructions: { type: 'string' },
        formCues: { type: 'list', items: { type: 'string' } },
        // Metadata
        difficulty: { type: 'number' },
        metValue: { type: 'number' },
        recommendedWeight: { type: 'number' },
        weightRatio: { type: 'number' },
        // The actionLibraryList[0].id — the "variant id" — required for the
        // saveWorkout payload (Speediance keys per-template exercises by
        // variant id, NOT groupId).
        defaultVariantId: { type: 'number' },
        // Speediance side last-modified hint; mostly for debugging which
        // entries went stale.
        speedianceCachedAt: { type: 'string', required: true },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: [],
            template: 'CATALOG#EXERCISES',
            casing: 'none',
          },
          sk: {
            field: 'sk',
            composite: ['groupId'],
            template: 'EXERCISE#${groupId}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ExerciseCatalogEntity = ReturnType<typeof exerciseCatalogEntity>;
