'use server';

import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { z } from 'zod';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

const region = process.env.AWS_REGION ?? 'us-west-2';

const InviteSchema = z.object({
  email: z.string().email().max(320),
});

export interface InviteResult {
  ok: boolean;
  message: string;
}

/**
 * Cognito admin-invite flow (Phase 4.1). Creates a user in the configured
 * pool with a temporary password and tells Cognito to email them.
 *
 * Authorization: any signed-in user can invite (we don't have a group
 * model yet — Phase 4 follow-up). When we do, gate this on
 * `cognito:groups` claim including "admin".
 */
export async function inviteUser(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in to invite.' };
  const parsed = InviteSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const { email } = parsed.data;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return { ok: false, message: 'COGNITO_USER_POOL_ID not set.' };

  const client = new CognitoIdentityProviderClient({ region });
  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );
    return { ok: true, message: `Invite emailed to ${email}.` };
  } catch (err: unknown) {
    // Cognito surfaces "user already exists" as UsernameExistsException.
    const message =
      err instanceof Error
        ? err.name === 'UsernameExistsException'
          ? 'That user already exists.'
          : err.message
        : 'Invite failed.';
    return { ok: false, message };
  }
}

/**
 * Force a sync run for the signed-in user. Async ("Event") invoke — we
 * don't block the UI on the actual sync; the user reloads /dashboard a
 * minute later.
 */
export async function resyncMe(): Promise<{ ok: boolean; message: string }> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in first.' };
  const fnName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (!fnName) return { ok: false, message: 'SYNC_WORKER_FUNCTION_NAME env var missing.' };

  try {
    await new LambdaClient({ region }).send(
      new InvokeCommand({
        FunctionName: fnName,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify({ userId: claims.sub })),
      }),
    );
    return { ok: true, message: 'Sync started. Check /dashboard in ~30s.' };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : 'Resync failed.' };
  }
}

export interface AdminUser {
  email?: string;
  username: string;
  status: string;
  enabled: boolean;
  createdAt?: string;
}

/**
 * List users in the pool — for the admin page. Maps Cognito's verbose
 * shape to the shape we want to render.
 */
export async function listUsers(): Promise<AdminUser[]> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return [];
  const client = new CognitoIdentityProviderClient({ region });
  const result = await client.send(new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60 }));
  return (result.Users ?? []).map((u) => ({
    username: u.Username ?? '?',
    email: u.Attributes?.find((a) => a.Name === 'email')?.Value,
    status: u.UserStatus ?? 'UNKNOWN',
    enabled: u.Enabled ?? false,
    createdAt: u.UserCreateDate?.toISOString(),
  }));
}
