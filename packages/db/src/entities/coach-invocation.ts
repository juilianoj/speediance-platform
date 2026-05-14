import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * One row per AI-Coach turn. Captures the Bedrock usage so we can roll
 * up per-user spend on /admin — Bedrock is the only meaningfully
 * variable cost at family scale, so a token-level log gives us the
 * "$5/user/month" alert the roadmap §4.7 calls for without needing
 * Cost Explorer cost-allocation tags + activated Billing settings.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = COACH_CALL#{startedAt}
 *
 * The `startedAt` ISO timestamp is unique per turn (askCoach is
 * single-flight from the chat client), so collisions aren't a worry.
 */
export function coachInvocationEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'coachInvocation', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        startedAt: { type: 'string', required: true, readOnly: true },
        finishedAt: { type: 'string' },
        modelId: { type: 'string' },
        /** Bedrock-reported input tokens (system prompt + history + user
         *  message + tool-result blocks). */
        inputTokens: { type: 'number' },
        /** Bedrock-reported output tokens (assistant message + tool_use
         *  blocks, summed across every Converse iteration in the turn). */
        outputTokens: { type: 'number' },
        /** Number of Converse round-trips the turn made (1..MAX_TOOL_ITERATIONS).
         *  Useful for spotting prompts that walk a long tool chain. */
        iterations: { type: 'number' },
        /** End-to-end wall time on the server side, milliseconds. */
        durationMs: { type: 'number' },
        /** Whether the turn completed successfully (false = caller saw an
         *  AskError). Capped iterations also count as ok=false. */
        ok: { type: 'boolean' },
        /** Comma-separated tool names invoked this turn, e.g.
         *  "list_recent_workouts,list_catalog_exercises,create_workout_draft".
         *  Bounded length so a model that loops doesn't explode the row. */
        toolsUsed: { type: 'string' },
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
            composite: ['startedAt'],
            template: 'COACH_CALL#${startedAt}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type CoachInvocationEntity = ReturnType<typeof coachInvocationEntity>;
