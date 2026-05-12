/**
 * Discriminated union the login Server Action returns. The client renders
 * different UI per `state`:
 *   - 'mfa'         — existing user with MFA already registered; show TOTP input
 *   - 'newPassword' — invited user signing in for the first time with the
 *                     temporary password; show "set permanent password" form
 *   - 'mfaSetup'    — user with no MFA registered yet; show TOTP QR code and
 *                     prompt for a confirmation code
 *   - 'ok'          — terminal success state (a redirect normally happens
 *                     server-side; this is for completeness)
 *   - 'error'       — display message; never display the cause in production
 *
 * `session` round-trips the Cognito continuation token between Server Actions
 * so each step can resume the same auth flow. `username` is the email — we
 * need it for some `RespondToAuthChallenge` payloads that require it even
 * when a Session is present.
 */
export type LoginResult =
  | { state: 'mfa'; session: string; username: string }
  | { state: 'newPassword'; session: string; username: string }
  | {
      state: 'mfaSetup';
      session: string;
      username: string;
      /** Base32 TOTP secret — show as a manual-entry fallback. */
      secretCode: string;
      /** otpauth:// URI suitable for rendering as a QR code. */
      otpauthUri: string;
    }
  | { state: 'ok' }
  | { state: 'error'; message: string };

/** Shape of the id_token claims we rely on for routing / display. */
export interface IdTokenClaims {
  sub: string;
  email?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
  exp: number;
  iat: number;
}
