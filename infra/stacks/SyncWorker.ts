// Per-user nightly sync from the Speediance API into DynamoDB.
// Phase 1.x replaces the stub handler with the real worker. Phase 0.2 stands
// up the Lambda + the EventBridge schedule so the wiring is end-to-end real.

import type { DatabaseStack } from './Database';

interface SyncWorkerArgs {
  database: DatabaseStack;
}

export function SyncWorker({ database }: SyncWorkerArgs) {
  const fn = new sst.aws.Function('SyncWorker', {
    handler: 'apps/sync-worker/src/handler.handler',
    link: [database.table],
    timeout: '5 minutes',
    memory: '512 MB',
    environment: {
      LOG_LEVEL: 'info',
    },
  });

  // 5am ET (= 09:00 UTC during DST, 10:00 UTC standard). EventBridge cron
  // doesn't support TZ — Phase 1.4 picks one or installs a small Lambda
  // that re-evaluates. For now: 10:00 UTC year-round.
  new sst.aws.Cron('SyncWorkerNightly', {
    schedule: 'cron(0 10 * * ? *)',
    function: fn.arn,
  });

  return { functionArn: fn.functionArn };
}

export type SyncWorkerStack = ReturnType<typeof SyncWorker>;
