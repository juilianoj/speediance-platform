import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Coaching memory: persistent context that the AI Coach sees on every call.
 * Examples — "user noted left-knee discomfort 2026-05-03", "user prefers
 * mornings", "user travels frequently and needs shorter sessions on Tuesdays".
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = MEMORY#{createdAt}   — chronological ordering for free
 *
 * The AI Coach reads these via a Query against the primary index with
 * `begins_with(sk, 'MEMORY#')` and an optional `Limit` to keep prompt size
 * bounded.
 */
export function memoryEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'memory', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        createdAt: { type: 'string', required: true, readOnly: true },
        category: { type: 'string' }, // e.g. 'injury', 'preference', 'goal'
        text: { type: 'string', required: true },
        // Optional structured payload for AI consumers (e.g. parsed
        // injury location). Stored as JSON string; opaque to DDB.
        meta: { type: 'string' },
        active: { type: 'boolean', default: true },
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
            composite: ['createdAt'],
            template: 'MEMORY#${createdAt}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type MemoryEntity = ReturnType<typeof memoryEntity>;
