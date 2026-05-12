import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * One completed (or scheduled-but-incomplete) Speediance workout session.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = WORKOUT#{startTime}
 *
 * GSI2 (sparse — populated only for completed workouts):
 *   GSI2PK = USER#{userId}#WEEK
 *   GSI2SK = {weekIso}    — the Thursday-of-week date string
 *
 * `startTime` is ISO-8601 with millisecond precision so it sorts lexically by
 * actual chronological order: e.g. `2026-05-11T13:00:00.000Z`.
 */
export function workoutEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'workout', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        startTime: { type: 'string', required: true, readOnly: true },
        templateCode: { type: 'string' },
        title: { type: 'string' },
        durationSeconds: { type: 'number' },
        totalCapacity: { type: 'number' },
        calories: { type: 'number' },
        deviceType: { type: 'number' },
        cycle: { type: 'number' },
        weekIso: { type: 'string' }, // Thursday of the workout's ISO week
        completed: { type: 'boolean', default: false },
        speedianceTrainingId: { type: 'string' }, // upstream `id` from the Speediance API
        speedianceTrainingType: { type: 'string' }, // 'course' | 'custom'
        createdAt: { type: 'string' },
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
            composite: ['startTime'],
            template: 'WORKOUT#${startTime}',
            casing: 'none',
          },
        },
        byWeek: {
          index: 'gsi2',
          pk: {
            field: 'gsi2pk',
            composite: ['userId'],
            template: 'USER#${userId}#WEEK',
            casing: 'none',
          },
          sk: {
            field: 'gsi2sk',
            composite: ['weekIso'],
            template: '${weekIso}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type WorkoutEntity = ReturnType<typeof workoutEntity>;
