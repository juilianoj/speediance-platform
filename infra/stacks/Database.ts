// Single-table design (roadmap §3).
//   PK = USER#{userId}   — every item is partitioned by user
//   SK prefixes:
//     PROFILE
//     WORKOUT#{startTime}
//     SET#{startTime}#{exerciseId}#{setNum}
//     EXERCISE#{exerciseId}
//     AGG#WEEK#{ISO_thursday}
//     AGG#CYCLE#{n}
//     AGG#MUSCLE#{group}
//     PROGRAM#{id}
//     MEMORY#{ts}
//
// GSI1 (sparse): per-exercise history. Set/Exercise items populate gsi1pk/gsi1sk
//   GSI1PK = EX#{exerciseId}   GSI1SK = {startTime}
// GSI2 (sparse): weekly time-range scans across all users isn't a use case, but
//   per-user weekly traversal is the dashboard's hot path.
//   GSI2PK = USER#{userId}#WEEK   GSI2SK = {ISO_thursday}
//
// Other queries are O(1) lookups against pre-aggregated AGG#* items, so we
// deliberately keep the GSI surface tiny — fewer indexes, less write cost.

export function Database() {
  const isProd = $app.stage === 'prod';

  const table = new sst.aws.Dynamo('Table', {
    fields: {
      pk: 'string',
      sk: 'string',
      gsi1pk: 'string',
      gsi1sk: 'string',
      gsi2pk: 'string',
      gsi2sk: 'string',
    },
    primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
    globalIndexes: {
      gsi1: { hashKey: 'gsi1pk', rangeKey: 'gsi1sk' },
      gsi2: { hashKey: 'gsi2pk', rangeKey: 'gsi2sk' },
    },
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
