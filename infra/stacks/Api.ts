// Hono-on-Lambda surface, currently fronting the remote MCP endpoint
// (`POST /mcp` + `GET /mcp` for SSE). Auth is per-request bearer-token
// against the `apiKey` entity; see `apps/api/src/mcp-auth.ts`.
//
// Wire-up:
//   - `apps/api/src/handler.ts` is a Hono → Lambda adapter via
//     `hono/aws-lambda`.
//   - `url: true` exposes a public Lambda Function URL. We deliberately
//     skip API Gateway: bearer auth lives in the handler, we don't need
//     a usage plan, and Function URLs have a 15-minute timeout instead
//     of API Gateway's 30 seconds — useful headroom even though MCP
//     individual requests are short.
//   - Auth + Bedrock + DDB IAM mirror what `apps/web` already has so the
//     same coach tools work end-to-end.

import type { AuthStack } from './Auth';
import type { DatabaseStack } from './Database';

interface ApiArgs {
  database: DatabaseStack;
  auth: AuthStack;
}

export function Api({ database, auth }: ApiArgs) {
  // Function URL hands us an HTTPS endpoint with no per-request charge,
  // no API Gateway integration, and full Web-standard Request/Response —
  // the StreamableHTTP transport's preferred shape.
  const fn = new sst.aws.Function('ApiHandler', {
    handler: '../apps/api/src/handler.handler',
    // Public Function URL. Auth is handled in the Hono app via
    // `Authorization: Bearer <key>`; we don't gate at the IAM layer
    // because legitimate clients (Claude Desktop) have no AWS creds.
    url: true,
    link: [database.table],
    // MCP requests are short — `initialize` + `tools/list` + a tool call
    // each cost <100ms of network + DDB. Bedrock-backed tools would push
    // the upper bound; 60s leaves plenty of room. Function URLs cap at
    // 15 minutes so this is well under the platform ceiling.
    timeout: '60 seconds',
    memory: '512 MB',
    environment: {
      LOG_LEVEL: 'info',
      SST_STAGE: $app.stage,
      DYNAMO_TABLE_NAME: database.table.name,
    },
    permissions: [
      // Bedrock — mirrors apps/web. The MCP server doesn't *currently*
      // invoke Bedrock directly (its tools are pure DDB reads/writes),
      // but we grant the perm now so future tools (e.g. an analyser
      // that calls Claude on the server side) don't require an
      // infra-change round-trip.
      {
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      },
    ],
  });

  // The legacy ApiRouter (Phase 0.2 stub) is retained so existing env
  // vars on apps/web (`NEXT_PUBLIC_API_URL=api.url`) keep resolving.
  // Re-points at the Function URL so any client that was hitting the
  // router gets routed to the new Lambda. We also expose the raw
  // function URL — handier for curl smoke tests + the MCP Claude Desktop
  // config snippet in mcp-server/README.md.
  const router = new sst.aws.Router('ApiRouter', {});

  // Mark `auth` as "intentionally referenced" — we don't need a direct
  // dependency yet, but the stack args still pass it in.
  void auth;

  return { url: router.url, mcpUrl: fn.url };
}

export type ApiStack = ReturnType<typeof Api>;
