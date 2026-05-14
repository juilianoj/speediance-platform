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
        /** Self-reported gender. Used purely to render an appropriate
         *  silhouette on the muscle-balance figure — traditional norms,
         *  optional. */
        gender: { type: ['male', 'female'] as const },
        /** When true, the user has opted out of the Cardio section — nav
         *  link is hidden and /cardio redirects to /dashboard. Default
         *  (undefined/false) shows the section. */
        hideCardio: { type: 'boolean' },
        unit: { type: 'number' }, // 0 = metric, 1 = imperial (matches Speediance)
        region: {
          type: ['Global', 'EU'] as const,
          default: 'Global',
        },
        deviceType: { type: 'number' },
        allowMonsterMoves: { type: 'boolean' },
        syncStartDate: { type: 'string' }, // YYYY-MM-DD — sync worker pulls records from here forward
        /** ISO timestamp of the last successful sync. Surfaced on the
         *  dashboard so users know how fresh their data is. Written by
         *  the SyncWorker after a successful syncUser run. */
        lastSyncedAt: { type: 'string' },
        speedianceSecretArn: { type: 'string' }, // never the raw token; just the Secrets Manager ARN
        schedule: { type: 'string' }, // JSON: day-of-week → preferred slots
        goals: { type: 'string' }, // JSON: free-form user-stated goals for the AI Coach
        /** Structured coaching preferences injected into the Coach's system
         *  prompt on every call. Keep it small — system-prompt overhead
         *  multiplies across every turn. Free-form/long context belongs in
         *  the `memory` entity instead. */
        coachPrefs: {
          type: 'map',
          properties: {
            primaryGoal: {
              type: [
                'strength',
                'hypertrophy',
                'general-fitness',
                'fat-loss',
                'endurance',
              ] as const,
            },
            sessionsPerWeek: { type: 'number' },
            sessionMinutes: { type: 'number' },
            equipmentConstraints: { type: 'string' },
          },
        },
        /** Display-safe prefix of the user's active MCP API key, e.g.
         *  "spd_xxxxxxxx". Surfaced on /profile so the user can recognise
         *  their key without us round-tripping the secret. The full key
         *  lives in the `apiKey` entity (USER#{id} / APIKEY) and is shown
         *  exactly once at generation time. Absent = no active key. */
        mcpApiKeyPrefix: { type: 'string' },
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
