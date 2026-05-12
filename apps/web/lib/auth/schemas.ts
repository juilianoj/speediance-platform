import { z } from 'zod';

/** Validation for the email+password form. Email length cap per RFC 5321. */
export const LoginInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

/** Validation for the MFA step. `code` must be exactly 6 digits — Cognito's
 *  TOTP implementation rejects non-numeric or wrong-length codes anyway,
 *  but failing locally is faster and avoids a wasted Cognito request. */
export const MfaInputSchema = z.object({
  session: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type MfaInput = z.infer<typeof MfaInputSchema>;
