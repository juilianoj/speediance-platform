import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * User-submitted feedback / feature request / bug report. Stored per-user
 * so the admin page can scan across users when triaging.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = FEEDBACK#{createdAt}
 *
 * `category` is a short discriminator the user picks from a dropdown so we
 * can filter/route later. `status` is admin-side workflow state.
 */
export function feedbackEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'feedback', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        createdAt: { type: 'string', required: true, readOnly: true },
        userEmail: { type: 'string' },
        category: {
          type: ['bug', 'feature', 'suggestion', 'question', 'other'] as const,
          default: 'suggestion',
        },
        subject: { type: 'string' },
        body: { type: 'string' },
        status: {
          type: ['open', 'triaged', 'in_progress', 'done', 'wontfix'] as const,
          default: 'open',
        },
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
            template: 'FEEDBACK#${createdAt}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type FeedbackEntity = ReturnType<typeof feedbackEntity>;
