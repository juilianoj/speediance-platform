import { z } from 'zod';

/**
 * Profile form input. `password` is intentionally optional on UPDATE — the
 * user shouldn't have to re-type their Speediance password just to change
 * their bodyweight. The Server Action reads the existing secret to determine
 * if password was supplied or should be kept.
 */
export const ProfileInputSchema = z.object({
  speedianceEmail: z.string().email().max(320),
  /** Optional on update; required on first save. The Server Action enforces
   *  the required-on-create rule because the schema can't see existing state. */
  speediancePassword: z.string().max(256).optional().default(''),
  region: z.enum(['Global', 'EU']),
  deviceType: z.coerce.number().int().min(1).max(2),
  allowMonsterMoves: z.coerce.boolean(),
  bodyweight: z.coerce.number().positive().max(2000).optional(),
  unit: z.coerce.number().int().min(0).max(1),
  /** ISO `YYYY-MM-DD`. The sync worker pulls Speediance records from here forward. */
  syncStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional(),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export type ProfileSaveResult =
  | { state: 'ok'; message: string }
  | { state: 'error'; message: string }
  | { state: 'invalidCreds'; message: string };
