import 'server-only';
import { cookies } from 'next/headers';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { getCognitoConfig } from './cognito.js';
import type { IdTokenClaims } from './types.js';

/**
 * Cookie shape:
 *   id_token       — JWT, validated on every request via middleware
 *   access_token   — JWT, sent on API calls (Phase 1.x)
 *   refresh_token  — opaque, used to renew id/access without re-prompt (Phase 1.x)
 *
 * All three are HTTP-only + Secure + SameSite=Lax so JS can't read them and
 * cross-site form posts can't carry them.
 *
 * On logout we clear all three and call GlobalSignOut to revoke the refresh
 * token server-side (so a stolen refresh token becomes useless immediately).
 */
export const COOKIE_NAMES = {
  id: 'spd_id',
  access: 'spd_access',
  refresh: 'spd_refresh',
} as const;

interface SetSessionInput {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** id_token TTL in seconds (Cognito returns this on InitiateAuth.AuthenticationResult.ExpiresIn). */
  expiresIn: number;
}

export async function setSessionCookies(input: SetSessionInput): Promise<void> {
  const jar = await cookies();
  const common = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
  };
  jar.set(COOKIE_NAMES.id, input.idToken, { ...common, maxAge: input.expiresIn });
  jar.set(COOKIE_NAMES.access, input.accessToken, { ...common, maxAge: input.expiresIn });
  // 30 days — matches Cognito client refreshTokenValidity. Cookie clears
  // on logout regardless.
  jar.set(COOKIE_NAMES.refresh, input.refreshToken, { ...common, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of Object.values(COOKIE_NAMES)) {
    jar.delete(name);
  }
}

let cachedIdVerifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getIdVerifier() {
  if (cachedIdVerifier) return cachedIdVerifier;
  const cfg = getCognitoConfig();
  cachedIdVerifier = CognitoJwtVerifier.create({
    userPoolId: cfg.userPoolId,
    tokenUse: 'id',
    clientId: cfg.userPoolClientId,
  });
  return cachedIdVerifier;
}

/** Validate the id_token from the cookie jar. Returns the decoded claims on
 *  success, `null` on any failure (expired, malformed, wrong audience, etc).
 *  Never throws — middleware and Server Components rely on this returning
 *  `null` to gate redirects. */
export async function verifyIdTokenFromCookies(): Promise<IdTokenClaims | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAMES.id)?.value;
  if (!token) return null;
  try {
    const payload = (await getIdVerifier().verify(token)) as unknown as IdTokenClaims;
    return payload;
  } catch {
    // Invalid / expired / malformed — caller redirects to /login.
    return null;
  }
}

/** Lightweight variant for use inside `middleware.ts`, where `cookies()` from
 *  next/headers isn't available — we read from the NextRequest instead. */
export async function verifyIdToken(token: string | undefined): Promise<IdTokenClaims | null> {
  if (!token) return null;
  try {
    const payload = (await getIdVerifier().verify(token)) as unknown as IdTokenClaims;
    return payload;
  } catch {
    return null;
  }
}
