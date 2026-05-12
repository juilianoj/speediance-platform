import { z } from 'zod';

/** Cognito's canonical username when the pool uses email as an alias
 *  is the user's `sub` UUID (e.g. `a801f3f0-b061-708f-0c24-8ca85277ed5f`).
 *  Subsequent challenge responses carry that value verbatim in the
 *  USERNAME field; treating it opaquely keeps the validation honest. */
const UsernameSchema = z.string().min(1).max(320);

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
  username: UsernameSchema,
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

/** First-sign-in: replace the temporary password with a permanent one.
 *  Lengths and complexity must match the Cognito pool's passwordPolicy
 *  (12 chars, mixed case + number + symbol). We surface a minimum-length
 *  check locally so the user gets immediate feedback. Cognito enforces
 *  the rest server-side. */
export const NewPasswordInputSchema = z.object({
  session: z.string().min(1),
  username: UsernameSchema,
  newPassword: z.string().min(12).max(256),
});

/** MFA registration: user has scanned the QR / typed the secret into their
 *  authenticator app and is sending the first 6-digit code to prove it. */
export const MfaSetupInputSchema = z.object({
  session: z.string().min(1),
  username: UsernameSchema,
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type MfaInput = z.infer<typeof MfaInputSchema>;
export type NewPasswordInput = z.infer<typeof NewPasswordInputSchema>;
export type MfaSetupInput = z.infer<typeof MfaSetupInputSchema>;
