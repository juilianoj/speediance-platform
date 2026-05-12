// Next.js 14 (App Router) deployed via SST's Nextjs construct.
//
// Phase 0.7 added:
//   - server-side SRP + MFA login at /login
//   - JWT-gated /dashboard route (via apps/web/middleware.ts)
//   - signOut via Cognito GlobalSignOut
//
// Cognito IDs are passed as server-only env vars (no NEXT_PUBLIC prefix) so
// they never get inlined into the client bundle. The values themselves
// aren't secrets, but keeping them server-side reinforces "auth happens on
// the server" — if a future contributor reaches for them in client code,
// the missing reference is a useful signal that they're working in the
// wrong layer.

import type { ApiStack } from './Api';
import type { AuthStack } from './Auth';

interface WebArgs {
  api: ApiStack;
  auth: AuthStack;
}

export function Web({ api, auth }: WebArgs) {
  const site = new sst.aws.Nextjs('Web', {
    // Relative to sst.config.ts (infra/) — see SyncWorker.ts for the same reason.
    path: '../apps/web',
    environment: {
      // Server-side: consumed by lib/auth/cognito.ts and lib/auth/session.ts.
      COGNITO_USER_POOL_ID: auth.userPool.id,
      COGNITO_USER_POOL_CLIENT_ID: auth.userPoolClient.id,
      // Client + server: API base for Phase 1.x mutations. Public is fine —
      // CloudFront URL is already known to anyone with the site URL.
      NEXT_PUBLIC_API_URL: api.url,
    },
  });

  return { url: site.url };
}

export type WebStack = ReturnType<typeof Web>;
