import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createDb } from '@speediance/db';
import { createServer } from '@speediance/mcp-server';
import { Hono } from 'hono';

import { resolveBearerToken, redactKey, type ResolvedAuth } from './mcp-auth.js';

/**
 * Hono app behind the `/mcp` Lambda. Currently exposes:
 *
 *   GET  /health    Always-on liveness check (used by deployment smoke tests).
 *   POST /mcp       MCP JSON-RPC over HTTP. Body is one JSON-RPC message;
 *                   response is either inline JSON or an SSE stream depending
 *                   on what the SDK's StreamableHTTP transport decides.
 *   GET  /mcp       SSE upgrade — used by clients that prefer streaming. The
 *                   SDK's transport handles the protocol; we just authorise
 *                   and forward.
 *
 * Each request is fully stateless: we instantiate a fresh MCP server + a
 * fresh `WebStandardStreamableHTTPServerTransport` per request, hand the
 * request off, and return the Response the SDK builds. That fits API
 * Gateway's request/response model (30s ceiling) — no daemon, no shared
 * state, no per-connection cleanup.
 *
 * Auth model: every /mcp request must carry `Authorization: Bearer spd_…`.
 * We resolve the token to a userId via `apiKeyLookups` (DDB GetItem on
 * PK=APIKEY#{key}), bind a `UserScopedDb` for that user, and pass it into
 * `createServer({ getDb })`. The SDK never sees the user — the only path
 * to tenant data is through the scoped DB we hand it.
 */
export const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

app.all('/mcp', async (c) => {
  // 1. Authorise. `Authorization: Bearer spd_…`
  const bearer = c.req.header('authorization') ?? c.req.header('Authorization');
  let auth: ResolvedAuth;
  try {
    auth = await resolveBearerToken(bearer);
  } catch (err) {
    // Auth errors are logged with the prefix only (never the full key).
    console.warn('mcp: auth failed', {
      reason: err instanceof Error ? err.message : 'unknown',
      // The header itself isn't logged — `redactKey` guards against a
      // caller accidentally sending the full key as the user-agent etc.
      prefix: redactKey(bearer ?? ''),
    });
    return c.json({ error: 'unauthorized' }, 401);
  }

  // 2. Per-request server. Cheap to construct — registration is just an
  //    in-memory map under the hood. Reusing one across requests would
  //    leak state across users in stateful mode, so we always build new.
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) {
    console.error('mcp: DYNAMO_TABLE_NAME env var missing');
    return c.json({ error: 'server misconfigured' }, 500);
  }
  const db = createDb({ tableName }).forUser(auth.userId);
  const server = createServer({ getDb: () => db });

  // Stateless transport: no session cookies, no SSE resumability, no
  // in-memory connection state. Every request is fully self-contained,
  // which is what the API-Gateway-then-Lambda execution model rewards.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    // `c.req.raw` is the underlying Web-standard Request — exactly what
    // the SDK expects. `handleRequest` returns a Web-standard Response,
    // which Hono passes through unchanged.
    return await transport.handleRequest(c.req.raw);
  } catch (err) {
    console.error('mcp: transport error', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return c.json({ error: 'mcp transport failed' }, 500);
  } finally {
    // Tear down so the connection map inside the transport gets cleared
    // promptly — under warm-Lambda reuse a leak would accumulate.
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});
