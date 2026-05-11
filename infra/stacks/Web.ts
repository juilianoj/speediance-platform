// Next.js 14 (App Router) deployed via SST's Nextjs construct. Phase 0.7
// adds the protected /dashboard route + Cognito JWT gating. For Phase 0.2
// we declare the construct against the placeholder app in apps/web so the
// stage actually has a URL to visit.

import type { ApiStack } from './Api';
import type { AuthStack } from './Auth';

interface WebArgs {
  api: ApiStack;
  auth: AuthStack;
}

export function Web({ api, auth }: WebArgs) {
  const site = new sst.aws.Nextjs('Web', {
    path: 'apps/web',
    environment: {
      NEXT_PUBLIC_API_URL: api.url,
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: auth.userPool.id,
      NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: auth.userPoolClient.id,
    },
  });

  return { url: site.url };
}

export type WebStack = ReturnType<typeof Web>;
