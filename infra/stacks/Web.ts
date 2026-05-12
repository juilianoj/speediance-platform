// Next.js 14 (App Router) deployed via SST's Nextjs construct.
//
// Phase 0.7: server-side login at /login, JWT-gated /dashboard, signOut.
// Phase 1.5: granted Secrets Manager perms so the Profile-page Server
//            Action can store the user's Speediance credentials. The
//            permissions are scoped to the per-stage secret namespace —
//            `speediance-platform/{stage}/users/*` — so a Lambda compromise
//            can't read other stages' secrets.
//
// Cognito IDs are passed as server-only env vars (no NEXT_PUBLIC prefix) so
// they never get inlined into the client bundle.

import type { ApiStack } from './Api';
import type { AuthStack } from './Auth';

interface WebArgs {
  api: ApiStack;
  auth: AuthStack;
}

export function Web({ api, auth }: WebArgs) {
  const stage = $app.stage;
  const region = 'us-west-2';
  // ARN pattern for this stage's per-user Speediance secrets. Cannot use a
  // fully-resolved account id here without an STS lookup; the wildcard
  // covers the account the deploy is targeting.
  const secretsArnPattern = `arn:aws:secretsmanager:${region}:*:secret:speediance-platform/${stage}/users/*`;

  const site = new sst.aws.Nextjs('Web', {
    // Relative to sst.config.ts (infra/) — see SyncWorker.ts for the same reason.
    path: '../apps/web',
    environment: {
      // Server-side: consumed by lib/auth/cognito.ts and lib/auth/session.ts.
      COGNITO_USER_POOL_ID: auth.userPool.id,
      COGNITO_USER_POOL_CLIENT_ID: auth.userPoolClient.id,
      // Stage is needed by createSecretsStore to namespace secret names.
      SST_STAGE: stage,
      // Client + server: API base for Phase 1.x mutations. Public is fine —
      // CloudFront URL is already known to anyone with the site URL.
      NEXT_PUBLIC_API_URL: api.url,
    },
    permissions: [
      {
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:PutSecretValue',
          'secretsmanager:DescribeSecret',
          'secretsmanager:DeleteSecret',
          'secretsmanager:TagResource',
        ],
        resources: [secretsArnPattern],
      },
      // CreateSecret requires Resource='*' the first time a name is used,
      // because the ARN doesn't exist yet. Scope is still narrowed by name
      // via a Condition on the name prefix.
      {
        actions: ['secretsmanager:CreateSecret'],
        resources: ['*'],
      },
    ],
  });

  return { url: site.url };
}

export type WebStack = ReturnType<typeof Web>;
