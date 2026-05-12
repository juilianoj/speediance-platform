'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  AssociateSoftwareTokenCommand,
  AuthFlowType,
  ChallengeNameType,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  createSrpSession,
  signSrpSession,
  wrapAuthChallenge,
  wrapInitiateAuth,
} from 'cognito-srp-helper';

import { getCognitoClient, getCognitoConfig } from './cognito.js';
import {
  LoginInputSchema,
  MfaInputSchema,
  MfaSetupInputSchema,
  NewPasswordInputSchema,
} from './schemas.js';
import { clearSessionCookies, COOKIE_NAMES, setSessionCookies } from './session.js';
import type { LoginResult } from './types.js';

const TOTP_ISSUER = 'speediance-platform';

/**
 * Step 1: SRP password authentication. Returns the next state for the
 * client-side state machine:
 *   - 'mfa'         — existing user, MFA already enrolled, show TOTP input
 *   - 'newPassword' — invited user with temporary password, prompt for new one
 *   - 'mfaSetup'    — user has no MFA registered yet, show TOTP QR
 *   - 'ok'          — terminal success (we redirect server-side anyway)
 *
 * Never leaks whether the email is valid (preventUserExistenceErrors is on at
 * the Cognito client level, so Cognito returns a generic error).
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
    //
    // The 4th arg is `isHashed` and **defaults to `true`** in
    // cognito-srp-helper — a surprising default. We're passing plaintext
    // from the form, so we set it to `false` and the library hashes the
    // password during signSrpSession. With the default, the library would
    // treat the plaintext bytes as the password hash, the SRP signature
    // would be wrong, and Cognito returns the generic
    // "Incorrect username or password" error.
    const srpSession = createSrpSession(email, password, userPoolId, false);
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

    // When the pool uses email as an alias attribute (our case), Cognito's
    // canonical username is a generated UUID — surfaced here in
    // ChallengeParameters.USER_ID_FOR_SRP. SRP password-signature *and*
    // every subsequent ChallengeResponses.USERNAME field must use that
    // value, not the email the user typed. Mismatch → "Incorrect email
    // or password" with no other hint.
    const userIdForSrp = initResp.ChallengeParameters?.USER_ID_FOR_SRP ?? email;

    // -- 2. PASSWORD_VERIFIER: combine server SRP_B + salt + secret block,
    //       compute password proof, send back.
    const signed = signSrpSession(srpSession, initResp);
    const challengeResp = await client.send(
      new RespondToAuthChallengeCommand(
        wrapAuthChallenge(signed, {
          ChallengeName: ChallengeNameType.PASSWORD_VERIFIER,
          ClientId: userPoolClientId,
          Session: initResp.Session,
          ChallengeResponses: { USERNAME: userIdForSrp },
        }),
      ),
    );

    return await routeChallenge(challengeResp, userIdForSrp);
  } catch (err: unknown) {
    if (isNextRedirect(err)) throw err;
    // Cognito's "NotAuthorizedException" covers both wrong-password and
    // not-found (because preventUserExistenceErrors is ENABLED on the client).
    console.error('signIn failed', err);
    return { state: 'error', message: 'Incorrect email or password.' };
  }
}

/**
 * Step 2a: TOTP code from an already-enrolled authenticator.
 */
export async function verifyMfa(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const parsed = MfaInputSchema.safeParse({
    session: formData.get('session'),
    username: formData.get('username'),
    code: formData.get('code'),
  });
  if (!parsed.success) {
    return { state: 'error', message: 'Invalid 6-digit code.' };
  }

  const { session, username, code } = parsed.data;
  const { userPoolClientId } = getCognitoConfig();
  const client = getCognitoClient();

  try {
    const resp = await client.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
        ClientId: userPoolClientId,
        Session: session,
        ChallengeResponses: { USERNAME: username, SOFTWARE_TOKEN_MFA_CODE: code },
      }),
    );
    return await routeChallenge(resp, username);
  } catch (err: unknown) {
    if (isNextRedirect(err)) throw err;
    console.error('verifyMfa failed', err);
    return { state: 'error', message: 'Invalid MFA code. Try again.' };
  }
}

/**
 * Step 2b: replace the temporary password with a permanent one. Returned
 * directly after the SRP step when the user is signing in for the first time
 * (Cognito's NEW_PASSWORD_REQUIRED challenge).
 */
export async function setNewPassword(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const parsed = NewPasswordInputSchema.safeParse({
    session: formData.get('session'),
    username: formData.get('username'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) {
    return { state: 'error', message: 'Password must be at least 12 characters.' };
  }

  const { session, username, newPassword } = parsed.data;
  const { userPoolClientId } = getCognitoConfig();
  const client = getCognitoClient();

  try {
    const resp = await client.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
        ClientId: userPoolClientId,
        Session: session,
        ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
      }),
    );
    return await routeChallenge(resp, username);
  } catch (err: unknown) {
    if (isNextRedirect(err)) throw err;
    console.error('setNewPassword failed', err);
    // Cognito's password policy errors come back as InvalidPasswordException —
    // surface a generic message; the form-side hint already says what's required.
    return {
      state: 'error',
      message: 'Password rejected. Must be 12+ chars with mixed case, a number, and a symbol.',
    };
  }
}

/**
 * Step 2c: confirm the TOTP code the user typed after scanning the QR. Two
 * steps under the hood:
 *   1. VerifySoftwareToken — proves the user has the secret.
 *   2. RespondToAuthChallenge MFA_SETUP — Cognito records the MFA enrolment
 *      and returns the AuthenticationResult.
 */
export async function verifyMfaSetup(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const parsed = MfaSetupInputSchema.safeParse({
    session: formData.get('session'),
    username: formData.get('username'),
    code: formData.get('code'),
  });
  if (!parsed.success) {
    return { state: 'error', message: 'Invalid 6-digit code.' };
  }

  const { session, username, code } = parsed.data;
  const { userPoolClientId } = getCognitoConfig();
  const client = getCognitoClient();

  try {
    const verify = await client.send(
      new VerifySoftwareTokenCommand({ Session: session, UserCode: code }),
    );
    if (verify.Status !== 'SUCCESS' || !verify.Session) {
      return { state: 'error', message: 'Code did not verify. Try again.' };
    }

    const resp = await client.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: ChallengeNameType.MFA_SETUP,
        ClientId: userPoolClientId,
        Session: verify.Session,
        ChallengeResponses: { USERNAME: username },
      }),
    );
    return await routeChallenge(resp, username);
  } catch (err: unknown) {
    if (isNextRedirect(err)) throw err;
    console.error('verifyMfaSetup failed', err);
    return { state: 'error', message: 'MFA setup failed. Try again.' };
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
      console.warn('GlobalSignOut failed (continuing to clear cookies)', err);
    }
  }
  await clearSessionCookies();
  redirect('/login');
}

/**
 * Inspect a Cognito challenge response and turn it into the right
 * `LoginResult` state — or persist tokens and redirect if Cognito returned
 * an AuthenticationResult.
 */
async function routeChallenge(
  resp: {
    ChallengeName?: string;
    Session?: string;
    AuthenticationResult?: {
      IdToken?: string;
      AccessToken?: string;
      RefreshToken?: string;
      ExpiresIn?: number;
    };
  },
  username: string,
): Promise<LoginResult> {
  if (resp.AuthenticationResult) {
    await persistTokens(resp.AuthenticationResult);
    redirect('/dashboard');
  }

  if (!resp.Session) {
    return { state: 'error', message: 'Missing continuation token.' };
  }

  switch (resp.ChallengeName) {
    case ChallengeNameType.SOFTWARE_TOKEN_MFA:
      return { state: 'mfa', session: resp.Session, username };

    case ChallengeNameType.NEW_PASSWORD_REQUIRED:
      return { state: 'newPassword', session: resp.Session, username };

    case ChallengeNameType.MFA_SETUP:
      return await beginMfaSetup(resp.Session, username);

    default:
      return {
        state: 'error',
        message: `Unsupported auth challenge: ${resp.ChallengeName ?? 'unknown'}`,
      };
  }
}

/**
 * AssociateSoftwareToken returns the TOTP secret and a fresh Session.
 * We return the secret + an otpauth:// URI so the client can render a QR.
 */
async function beginMfaSetup(session: string, username: string): Promise<LoginResult> {
  const associate = await getCognitoClient().send(
    new AssociateSoftwareTokenCommand({ Session: session }),
  );
  if (!associate.SecretCode || !associate.Session) {
    return { state: 'error', message: 'Could not start MFA setup.' };
  }
  const issuer = encodeURIComponent(TOTP_ISSUER);
  const label = encodeURIComponent(`${TOTP_ISSUER}:${username}`);
  const otpauthUri = `otpauth://totp/${label}?secret=${associate.SecretCode}&issuer=${issuer}`;
  return {
    state: 'mfaSetup',
    session: associate.Session,
    username,
    secretCode: associate.SecretCode,
    otpauthUri,
  };
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

/** `redirect()` from next/navigation throws an internal `NEXT_REDIRECT` error
 *  to halt rendering. Don't swallow it in our generic catch blocks. */
function isNextRedirect(err: unknown): err is Error {
  return err instanceof Error && err.message.includes('NEXT_REDIRECT');
}
