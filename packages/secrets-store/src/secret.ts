import { z } from 'zod';

/**
 * Shape of the Speediance credential blob we store per user.
 *
 * - `email` / `password`: the user's Speediance login. The Sync Worker uses
 *   them when the persisted token expires or returns code:91.
 * - `region`: which Speediance API host to hit.
 * - `deviceType` / `allowMonsterMoves`: device profile for library scoping.
 * - `token` / `appUserId`: the most recent successful login's result. Reused
 *   on each sync to avoid kicking the user's phone session (Speediance only
 *   permits one active session per account).
 * - `tokenAcquiredAt`: ISO timestamp; if the token starts failing with code:91
 *   the sync worker re-logs in and refreshes the value.
 */
export const SpeedianceSecretSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
  region: z.enum(['Global', 'EU']).default('Global'),
  deviceType: z.number().int().min(1).max(2).default(1),
  allowMonsterMoves: z.boolean().default(false),
  token: z.string().optional(),
  appUserId: z.string().optional(),
  tokenAcquiredAt: z.string().optional(),
});

export type SpeedianceSecret = z.infer<typeof SpeedianceSecretSchema>;

/** Default secret name pattern. The `{stage}` segment keeps dev and prod
 *  isolated even within the same AWS account; the `{userId}` segment is the
 *  Cognito `sub` (UUID), which our auth flow uses everywhere. */
export function secretName(stage: string, userId: string): string {
  return `speediance-platform/${stage}/users/${userId}/speediance`;
}
