import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Per-user profile: bodyweight, schedule, region, the date from which the
 * sync worker pulls history. Exactly one item per user — singleton SK
 * `PROFILE`.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = PROFILE
 *
 * Speediance credentials live in AWS Secrets Manager (not here) — the only
 * reference to them is `secretArn` which the SyncWorker dereferences.
 */
export function profileEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'profile', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        email: { type: 'string' },
        displayName: { type: 'string' },
        bodyweight: { type: 'number' },
        unit: { type: 'number' }, // 0 = metric, 1 = imperial (matches Speediance)
        region: {
          type: ['Global', 'EU'] as const,
          default: 'Global',
        },
        deviceType: { type: 'number' },
        allowMonsterMoves: { type: 'boolean' },
        syncStartDate: { type: 'string' }, // YYYY-MM-DD — sync worker pulls records from here forward
        speedianceSecretArn: { type: 'string' }, // never the raw token; just the Secrets Manager ARN
        schedule: { type: 'string' }, // JSON: day-of-week → preferred slots
        goals: { type: 'string' }, // JSON: free-form user-stated goals for the AI Coach
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
            composite: [],
            template: 'PROFILE',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ProfileEntity = ReturnType<typeof profileEntity>;
