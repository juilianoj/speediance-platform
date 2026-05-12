'use server';

import { redirect } from 'next/navigation';
import {
  AuthFlowType,
  ChallengeNameType,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  createSrpSession,
  signSrpSession,
  wrapAuthChallenge,
  wrapInitiateAuth,
} from 'cognito-srp-helper';
import { cookies } from 'next/headers';

import { getCognitoClient, getCognitoConfig } from './cognito.js';
import { LoginInputSchema, MfaInputSchema } from './schemas.js';
import { clearSessionCookies, COOKIE_NAMES, setSessionCookies } from './session.js';
import type { LoginResult } from './types.js';

/**
 * Step 1: SRP password authentication.
 *
 * Returns either an MFA challenge (`{ state: 'mfa', session }`) or `'ok'` if
 * the user happens to have MFA disabled (shouldn't happen on our pool, but
 * we handle it for defence in depth). The `session` is Cognito's opaque
 * continuation token — round-tripped back to `verifyMfa` below.
 *
 * Never leaks whether the email is valid (preventUserExistenceErrors is on
 * at the Cognito client level, so Cognito returns a generic error).
 */
export async function signIn(_prev: LoginResult | null, formData: FormData): Promise<LoginResult> {
  const parsed = LoginInputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { state: 'error', message: 'Invalid email or password format.' };
  }

  const { email, password } = parsed.data;
  const { userPoolId, userPoolClientId } = getCognitoConfig();
  const client = getCognitoClient();

  try {
    // -- 1. SRP_A: client-side random + g^a derived; sent as USER_SRP_AUTH.
    const srpSession = createSrpSession(email, password, userPoolId);
    const initResp = await client.send(
      new InitiateAuthCommand(
        wrapInitiateAuth(srpSession, {
          AuthFlow: AuthFlowType.USER_SRP_AUTH,
          ClientId: userPoolClientId,
          AuthParameters: { USERNAME: email },
        }),
      ),
    );

    if (initResp.ChallengeName !== ChallengeNameType.PASSWORD_VERIFIER) {
      return { state: 'error', message: 'Unexpected auth response.' };
    }

    // -- 2. PASSWORD_VERIFIER: combine server SRP_B + salt + secret block,
    //       compute password proof, send back.
    const signed = signSrpSession(srpSession, initResp);
    const challengeResp = await client.send(
      new RespondToAuthChallengeCommand(
        wrapAuthChallenge(signed, {
          ChallengeName: ChallengeNameType.PASSWORD_VERIFIER,
          ClientId: userPoolClientId,
          Session: initResp.Session,
          ChallengeResponses: { USERNAME: email },
        }),
      ),
    );

    // -- 3. Either MFA challenge or final tokens.
    if (challengeResp.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA) {
      if (!challengeResp.Session) {
        return { state: 'error', message: 'Missing MFA continuation token.' };
      }
      return { state: 'mfa', session: challengeResp.Session };
    }

    if (challengeResp.AuthenticationResult) {
      await persistTokens(challengeResp.AuthenticationResult);
      redirect('/dashboard');
    }

    // Other challenges (NEW_PASSWORD_REQUIRED, MFA_SETUP) are Phase 0.3
    // (admin invite) territory. For now we punt — the bootstrap-admin
    // script handles first-time setup so existing users never hit them.
    return {
      state: 'error',
      message: 'This sign-in flow needs setup. Contact the admin.',
    };
  } catch (err: unknown) {
    // Surface a uniform message to the user; log the cause for the operator.
    // Cognito's "NotAuthorizedException" covers both wrong-password and
    // not-found (because preventUserExistenceErrors is ENABLED on the client).
    console.error('signIn failed', err);
    return { state: 'error', message: 'Incorrect email or password.' };
  }
}

/**
 * Step 2: respond to the SOFTWARE_TOKEN_MFA challenge with the user's TOTP
 * code. On success, sets cookies and redirects to /dashboard.
 */
export async function verifyMfa(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const parsed = MfaInputSchema.safeParse({
    session: formData.get('session'),
    code: formData.get('code'),
  });
  if (!parsed.success) {
    return { state: 'error', message: 'Invalid 6-digit code.' };
  }

  const { session, code } = parsed.data;
  const { userPoolClientId } = getCognitoConfig();
  const client = getCognitoClient();

  try {
    const resp = await client.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
        ClientId: userPoolClientId,
        Session: session,
        ChallengeResponses: {
          USERNAME: '', // Cognito ignores this when Session is present
          SOFTWARE_TOKEN_MFA_CODE: code,
        },
      }),
    );

    if (resp.AuthenticationResult) {
      await persistTokens(resp.AuthenticationResult);
      redirect('/dashboard');
    }
    return { state: 'error', message: 'MFA challenge did not return tokens.' };
  } catch (err: unknown) {
    // next/navigation.redirect throws an internal NEXT_REDIRECT signal that
    // we mustn't swallow — re-throw it so Next.js can hand the redirect
    // back to the client.
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err;
    console.error('verifyMfa failed', err);
    return { state: 'error', message: 'Invalid MFA code. Try again.' };
  }
}

/**
 * Server Action invoked by the `Log out` button. Best-effort revokes the
 * refresh token via GlobalSignOut, then clears cookies and redirects to
 * /login regardless of whether Cognito succeeded.
 */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const accessToken = jar.get(COOKIE_NAMES.access)?.value;
  if (accessToken) {
    try {
      await getCognitoClient().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch (err) {
      // Token already expired / revoked — fine; we're clearing local state
      // either way.
      console.warn('GlobalSignOut failed (continuing to clear cookies)', err);
    }
  }
  await clearSessionCookies();
  redirect('/login');
}

async function persistTokens(result: {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}): Promise<void> {
  if (!result.IdToken || !result.AccessToken || !result.RefreshToken) {
    throw new Error('Cognito returned an incomplete AuthenticationResult');
  }
  await setSessionCookies({
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn ?? 3600,
  });
}
