// Phase 0.4 will define the real single-table model (GSI1/GSI2, sparse,
// pay-per-request). For Phase 0.2 we create the empty table only so the
// SyncWorker stack has something to grant IAM permissions against.
//
// SK prefixes the roadmap commits to:
//   WORKOUT#{ts}, SET#{ts}#{ex}#{n}, EXERCISE#{id}, AGG#WEEK#{iso},
//   AGG#CYCLE#{n}, AGG#MUSCLE#{group}, PROGRAM#{id}, MEMORY#{ts}, PROFILE

export function Database() {
  const table = new sst.aws.Dynamo('Table', {
    fields: {
      pk: 'string',
      sk: 'string',
    },
    primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
  });

  return { table };
}

export type DatabaseStack = ReturnType<typeof Database>;
