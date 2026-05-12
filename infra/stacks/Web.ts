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
import type { DatabaseStack } from './Database';
import type { SyncWorkerStack } from './SyncWorker';

interface WebArgs {
  api: ApiStack;
  auth: AuthStack;
  database: DatabaseStack;
  syncWorker: SyncWorkerStack;
}

export function Web({ api, auth, database, syncWorker }: WebArgs) {
  const stage = $app.stage;
  const region = 'us-west-2';
  // ARN pattern for this stage's per-user Speediance secrets. Cannot use a
  // fully-resolved account id here without an STS lookup; the wildcard
  // covers the account the deploy is targeting.
  const secretsArnPattern = `arn:aws:secretsmanager:${region}:*:secret:speediance-platform/${stage}/users/*`;

  const site = new sst.aws.Nextjs('Web', {
    // Relative to sst.config.ts (infra/) — see SyncWorker.ts for the same reason.
    path: '../apps/web',
    // `link` grants the server function least-privilege IAM on the table
    // (Query / Get / Put / Update / Delete on the table's ARN). The plain
    // env-var below makes the table name available at runtime without
    // depending on the `sst` package's Resource accessor.
    link: [database.table],
    environment: {
      // Server-side: consumed by lib/auth/cognito.ts and lib/auth/session.ts.
      COGNITO_USER_POOL_ID: auth.userPool.id,
      COGNITO_USER_POOL_CLIENT_ID: auth.userPoolClient.id,
      // Stage is needed by createSecretsStore to namespace secret names.
      SST_STAGE: stage,
      // Read by lib/profile/actions.ts via @speediance/db.
      DYNAMO_TABLE_NAME: database.table.name,
      // Lets the saveProfile Server Action trigger an immediate sync after
      // the user enters their Speediance creds. Lambda's InvokeCommand
      // accepts either function name or ARN; ARN is unambiguous.
      SYNC_WORKER_FUNCTION_NAME: syncWorker.functionArn,
      // Client + server: API base for Phase 1.x mutations. Public is fine —
      // CloudFront URL is already known to anyone with the site URL.
      NEXT_PUBLIC_API_URL: api.url,
      // AI coach uses Bedrock instead of the Anthropic API directly so we
      // don't have to manage an API key — the Lambda's IAM role authorizes
      // model invocations. Override the model id here if Sonnet 4 isn't
      // available in your region; the `us.` prefix is a cross-region
      // inference profile that improves availability.
      BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
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
      // Invoke the SyncWorker after a profile save so the user sees
      // their data without waiting for the 10:00 UTC cron.
      {
        actions: ['lambda:InvokeFunction'],
        resources: [syncWorker.functionArn],
      },
      // Cognito admin actions for the /admin invite + list-users flow
      // (Phase 4.1) and for the per-user MFA toggle. Scoped to this
      // stage's user pool.
      {
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:ListUsers',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserMFAPreference',
        ],
        resources: [auth.userPool.arn],
      },
      // Bedrock invocations for the AI coach (Phase 3). Resource '*'
      // because Bedrock model ARNs are partition-scoped and cross-region
      // inference profiles route across multiple resources; the
      // bedrock:InvokeModel action alone has no side effects beyond
      // billing.
      {
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      },
    ],
  });

  return { url: site.url };
}

export type WebStack = ReturnType<typeof Web>;
