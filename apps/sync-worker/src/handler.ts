import type { Handler, ScheduledEvent } from 'aws-lambda';

import { bootstrapExerciseCatalog, type CatalogBootstrapSummary } from './catalog.js';
import { syncAllUsers, syncUser, type SyncSummary } from './sync.js';

/**
 * Sync-worker entrypoint. Three invocation shapes:
 *
 *   - **Scheduled** (EventBridge cron, 10:00 UTC daily) — payload looks like
 *     a `ScheduledEvent`; we iterate every profile that has Speediance creds
 *     and sync each one serially with a brief delay between.
 *
 *   - **Direct workout sync** with `{ userId: string }` — fired by the
 *     Profile page's `saveProfile` Server Action right after creds are
 *     stored, so the user sees data show up on /dashboard within seconds
 *     instead of having to wait for tomorrow's cron.
 *
 *   - **Catalog bootstrap** with `{ mode: 'catalog-bootstrap', userId }` —
 *     fired manually from /admin to (re)populate the global ExerciseCatalog
 *     from Speediance's action library. Uses the named user's Speediance
 *     credentials to enumerate the library. Long-running (~3-5 min for
 *     ~500 exercises); the Lambda is configured with a generous timeout.
 */
type DirectInvocation = { userId: string };
type CatalogBootstrapInvocation = { mode: 'catalog-bootstrap'; userId: string };
type Event = ScheduledEvent | DirectInvocation | CatalogBootstrapInvocation;
type Result = SyncSummary | SyncSummary[] | CatalogBootstrapSummary;

function isCatalogBootstrap(event: Event): event is CatalogBootstrapInvocation {
  return (
    typeof event === 'object' &&
    event !== null &&
    'mode' in event &&
    (event as { mode?: unknown }).mode === 'catalog-bootstrap'
  );
}

function isDirectInvocation(event: Event): event is DirectInvocation {
  return (
    typeof event === 'object' &&
    event !== null &&
    'userId' in event &&
    !('source' in event) &&
    !('mode' in event)
  );
}

export const handler: Handler<Event, Result> = async (event, context) => {
  const mode = isCatalogBootstrap(event)
    ? 'catalog-bootstrap'
    : isDirectInvocation(event)
      ? 'direct'
      : 'scheduled';
  console.info('sync-worker invoked', { requestId: context.awsRequestId, mode });

  if (isCatalogBootstrap(event)) {
    return await bootstrapExerciseCatalog(event.userId);
  }
  if (isDirectInvocation(event)) {
    return await syncUser(event.userId);
  }
  return await syncAllUsers();
};
