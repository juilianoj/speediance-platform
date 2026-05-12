// Per-user nightly sync from the Speediance API into DynamoDB.
// Phase 1.x replaces the stub handler with the real worker. Phase 0.2 stands
// up the Lambda + the EventBridge schedule so the wiring is end-to-end real.

import type { DatabaseStack } from './Database';

interface SyncWorkerArgs {
  database: DatabaseStack;
}

export function SyncWorker({ database }: SyncWorkerArgs) {
  const stage = $app.stage;
  const region = 'us-west-2';
  const secretsArnPattern = `arn:aws:secretsmanager:${region}:*:secret:speediance-platform/${stage}/users/*`;

  const fn = new sst.aws.Function('SyncWorker', {
    // Paths resolve relative to sst.config.ts (this file lives in infra/),
    // so we walk up to the repo root before descending into apps/.
    handler: '../apps/sync-worker/src/handler.handler',
    link: [database.table],
    // 15 minutes is the Lambda max. The default first-time sync pulls all
    // of history (back to 2018) — ~1400 sets/year of detail calls with
    // 100ms pacing between them, so a 5-year history can take 7-8 minutes.
    // After the initial backfill subsequent runs are fast (the upsert is
    // idempotent), but the timeout has to fit the worst case.
    timeout: '15 minutes',
    memory: '512 MB',
    environment: {
      LOG_LEVEL: 'info',
      SST_STAGE: stage,
      DYNAMO_TABLE_NAME: database.table.name,
    },
    // Read-only access to per-user Speediance secrets. We also need
    // PutSecretValue to refresh the persisted Speediance token on 401 —
    // the worker re-logs in and writes the new token back without ever
    // surfacing the password to the application layer above DynamoDB.
    permissions: [
      {
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
          'secretsmanager:PutSecretValue',
        ],
        resources: [secretsArnPattern],
      },
    ],
  });

  // 5am ET (= 09:00 UTC during DST, 10:00 UTC standard). EventBridge cron
  // doesn't support TZ — Phase 1.4 picks one or installs a small Lambda
  // that re-evaluates. For now: 10:00 UTC year-round.
  new sst.aws.Cron('SyncWorkerNightly', {
    schedule: 'cron(0 10 * * ? *)',
    function: fn.arn,
  });

  // The real `sst.aws.Function` exposes `.arn` (and `.name`). Earlier we
  // returned `.functionArn`, which only existed in our loose stub typedef.
  // At deploy time that resolved to `undefined`, the Web stack's
  // `lambda:InvokeFunction` permission ended up with an empty Resource,
  // and IAM rejected the role update with MalformedPolicyDocument.
  return { functionArn: fn.arn, functionName: fn.name };
}

export type SyncWorkerStack = ReturnType<typeof SyncWorker>;
