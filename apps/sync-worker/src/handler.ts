import type { Handler, ScheduledEvent } from 'aws-lambda';

import { syncAllUsers, syncUser, type SyncSummary } from './sync.js';

/**
 * Sync-worker entrypoint. Two invocation shapes:
 *
 *   - **Scheduled** (EventBridge cron, 10:00 UTC daily) — payload looks like
 *     a `ScheduledEvent`; we iterate every profile that has Speediance creds
 *     and sync each one serially with a brief delay between.
 *
 *   - **Direct invoke** with `{ userId: string }` — fired by the Profile
 *     page's `saveProfile` Server Action right after creds are stored, so
 *     the user sees data show up on /dashboard within seconds instead of
 *     having to wait for tomorrow's cron.
 */
type DirectInvocation = { userId: string };
type Event = ScheduledEvent | DirectInvocation;

function isDirectInvocation(event: Event): event is DirectInvocation {
  return typeof event === 'object' && event !== null && 'userId' in event && !('source' in event);
}

export const handler: Handler<Event, SyncSummary | SyncSummary[]> = async (event, context) => {
  console.info('sync-worker invoked', {
    requestId: context.awsRequestId,
    mode: isDirectInvocation(event) ? 'direct' : 'scheduled',
  });

  if (isDirectInvocation(event)) {
    return await syncUser(event.userId);
  }
  return await syncAllUsers();
};
