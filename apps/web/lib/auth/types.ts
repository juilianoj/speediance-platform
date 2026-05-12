/**
 * Discriminated union the login Server Action returns. The client renders
 * different UI per `state`:
 *   - 'mfa' — show TOTP input; the session string round-trips back to
 *             the second Server Action so it can resume the Cognito challenge
 *   - 'ok'  — login finished; redirect happens server-side, this is for
 *             completeness in case the client wants to know
 *   - 'error' — display the message; never display the cause in production
 */
export type LoginResult =
  | { state: 'mfa'; session: string }
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
