import type { ScheduledHandler } from 'aws-lambda';

// Stub handler. Phase 1.1 replaces this with the real per-user sync loop that
// reads Speediance creds from Secrets Manager, fetches training records, and
// upserts to DynamoDB.
export const handler: ScheduledHandler = async (event) => {
  console.info('sync-worker invoked', {
    id: event.id,
    time: event.time,
    note: 'phase-0 stub — replace in phase 1.1',
  });
};
