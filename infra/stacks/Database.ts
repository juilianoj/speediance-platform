// Phase 0.4 will define the real single-table model (GSI1/GSI2, sparse,
// pay-per-request). For Phase 0.2 we create the empty table only so the
// SyncWorker stack has something to grant IAM permissions against.
//
// SK prefixes the roadmap commits to:
//   WORKOUT#{ts}, SET#{ts}#{ex}#{n}, EXERCISE#{id}, AGG#WEEK#{iso},
//   AGG#CYCLE#{n}, AGG#MUSCLE#{group}, PROGRAM#{id}, MEMORY#{ts}, PROFILE

export function Database() {
  const isProd = $app.stage === 'prod';

  const table = new sst.aws.Dynamo('Table', {
    fields: {
      pk: 'string',
      sk: 'string',
    },
    primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
    transform: {
      table: {
        // Continuous backups, 35-day point-in-time recovery window.
        // Cheap insurance: ~$0.20/GB-month for our data size.
        pointInTimeRecovery: { enabled: true },
        // Block accidental `sst remove` / console-driven deletes once we
        // have real users' data. Dev/staging stays deletable so we can
        // iterate without `aws cli` rituals.
        deletionProtectionEnabled: isProd,
        // KMS-managed (AWS-owned) encryption is on by default; we make it
        // explicit so future reviewers don't have to dig the AWS docs.
        serverSideEncryption: {
          enabled: true,
        },
      },
    },
  });

  return { table };
}

export type DatabaseStack = ReturnType<typeof Database>;
