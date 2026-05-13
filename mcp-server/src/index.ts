#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDb } from '@speediance/db';

import { createServer } from './server.js';

/**
 * stdio entrypoint. Invoked by Claude Desktop via its `mcpServers`
 * config. The process inherits the parent's env, so we expect:
 *
 *   SPEEDIANCE_USER_ID   — the Cognito `sub` of the user we read/write as.
 *                          This is the auth — anyone with the env var can
 *                          impersonate, so don't share your Claude Desktop
 *                          config.
 *   DYNAMO_TABLE_NAME    — the deployed single-table name (dev or prod).
 *   AWS_PROFILE / AWS_*  — standard AWS SDK creds. The user's Mac IAM
 *                          identity must have ddb read/write on the table.
 *
 * Diagnostics go to stderr; stdout is reserved for MCP JSON-RPC frames.
 */
async function main(): Promise<void> {
  const userId = process.env.SPEEDIANCE_USER_ID;
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!userId) {
    process.stderr.write(
      'speediance-mcp: SPEEDIANCE_USER_ID env var is required (set it in claude_desktop_config.json).\n',
    );
    process.exit(1);
  }
  if (!tableName) {
    process.stderr.write(
      'speediance-mcp: DYNAMO_TABLE_NAME env var is required (set it in claude_desktop_config.json).\n',
    );
    process.exit(1);
  }

  // Build the user-scoped DB lazily so a bad env doesn't crash the boot —
  // tools/list still works, and the first tool call surfaces a usable error.
  const db = createDb({ tableName }).forUser(userId);
  const server = createServer({ getDb: () => db });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `speediance-mcp: connected via stdio (user=${userId}, table=${tableName})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `speediance-mcp: fatal — ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
