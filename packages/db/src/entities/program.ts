import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * AI-generated training program. Status drives whether the program is just a
 * draft (visible to the user but not active), approved (staged), or active
 * (pushed to the Speediance calendar). At most one program per user should be
 * `active` — enforced at the application layer, not the DB.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = PROGRAM#{programId}
 */
export function programEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'program', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        programId: { type: 'string', required: true, readOnly: true },
        name: { type: 'string' },
        status: {
          type: ['draft', 'approved', 'active', 'archived'] as const,
          default: 'draft',
        },
        weeks: { type: 'number' },
        // JSON blob of the full program structure — opaque to DDB,
        // serialised when written, validated by a Zod schema at the
        // application layer.
        plan: { type: 'string' },
        coachReasoning: { type: 'string' },
        approvedBy: { type: 'string' },
        approvedAt: { type: 'string' },
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
            composite: ['programId'],
            template: 'PROGRAM#${programId}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ProgramEntity = ReturnType<typeof programEntity>;
