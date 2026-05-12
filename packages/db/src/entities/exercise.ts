import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Per-user metadata about an exercise: best weight, working weight, last-done
 * date. Indexed on the primary key only — per-user lookups are O(1).
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = EXERCISE#{exerciseId}
 *
 * Updated by the aggregate-computation step after each sync.
 */
export function exerciseEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'exercise', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        exerciseId: { type: 'string', required: true, readOnly: true },
        name: { type: 'string' },
        muscleGroup: { type: 'string' },
        deviceType: { type: 'number' },
        isUnilateral: { type: 'boolean' },
        bestWeight: { type: 'number' },
        workingWeight: { type: 'number' },
        lastDone: { type: 'string' },
        totalSets: { type: 'number' },
        updatedAt: { type: 'string', watch: '*', set: () => new Date().toISOString() },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: ['userId'],
            template: 'USER#${userId}',
            casing: 'none',
          },
          sk: {
            field: 'sk',
            composite: ['exerciseId'],
            template: 'EXERCISE#${exerciseId}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ExerciseEntity = ReturnType<typeof exerciseEntity>;
