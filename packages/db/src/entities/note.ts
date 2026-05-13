import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * User-authored note attached to a workout session or an exercise.
 * Free-text annotations for context the metrics don't capture —
 * "left shoulder felt weird", "form felt great", "experimented with grip".
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = NOTE#{targetType}#{targetId}#{createdAt}
 *
 * targetType is `workout` (with targetId = workout startTime ISO) or
 * `exercise` (with targetId = action-library group id). Multiple notes
 * per target are allowed; they form a timeline ordered by createdAt.
 */
export function noteEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'note', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        targetType: { type: ['workout', 'exercise'] as const, required: true, readOnly: true },
        targetId: { type: 'string', required: true, readOnly: true },
        createdAt: { type: 'string', required: true, readOnly: true },
        body: { type: 'string', required: true },
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
            composite: ['targetType', 'targetId', 'createdAt'],
            template: 'NOTE#${targetType}#${targetId}#${createdAt}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type NoteEntity = ReturnType<typeof noteEntity>;
