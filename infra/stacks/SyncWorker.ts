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
    timeout: '5 minutes',
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

  return { functionArn: fn.functionArn, functionName: fn.name };
}

export type SyncWorkerStack = ReturnType<typeof SyncWorker>;
