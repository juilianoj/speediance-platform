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
  username: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

/** First-sign-in: replace the temporary password with a permanent one.
 *  Lengths and complexity must match the Cognito pool's passwordPolicy
 *  (12 chars, mixed case + number + symbol). We surface a minimum-length
 *  check locally so the user gets immediate feedback. Cognito enforces
 *  the rest server-side. */
export const NewPasswordInputSchema = z.object({
  session: z.string().min(1),
  username: z.string().email().max(320),
  newPassword: z.string().min(12).max(256),
});

/** MFA registration: user has scanned the QR / typed the secret into their
 *  authenticator app and is sending the first 6-digit code to prove it. */
export const MfaSetupInputSchema = z.object({
  session: z.string().min(1),
  username: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type MfaInput = z.infer<typeof MfaInputSchema>;
export type NewPasswordInput = z.infer<typeof NewPasswordInputSchema>;
export type MfaSetupInput = z.infer<typeof MfaSetupInputSchema>;
