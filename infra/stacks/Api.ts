// REST surface that Next.js routes can't (or shouldn't) own — bulk endpoints
// the sync worker writes to, admin-only mutations, MCP exposure later.
// Phase 0.2 only declares the resource so deploys succeed; real Hono router
// arrives with the data-pipeline phase.

import type { AuthStack } from './Auth';
import type { DatabaseStack } from './Database';

interface ApiArgs {
  database: DatabaseStack;
  auth: AuthStack;
}

export function Api({ database, auth }: ApiArgs) {
  const router = new sst.aws.Router('ApiRouter', {});

  // Mark deps as "intentionally referenced" so they appear in the SST graph
  // once we start binding them. Real handlers attach in Phase 1.x.
  void database;
  void auth;

  return { url: router.url };
}

export type ApiStack = ReturnType<typeof Api>;
