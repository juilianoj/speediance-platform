import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserScopedDb } from '@speediance/db';

import { TOOLS } from './tools.js';

/**
 * Build a configured MCP server. Caller wires it to a transport
 * (stdio for production, InMemoryTransport for tests).
 *
 * `getDb` is a factory rather than a value so the server can defer
 * AWS-SDK initialisation until the first tool call — at boot the user
 * may not have AWS creds in the environment yet (Claude Desktop spawns
 * us before the user signs in to anything).
 */
export interface CreateServerOptions {
  /** Identifier shown to the MCP client. Defaults to "@speediance/mcp-server". */
  name?: string;
  /** Semantic version surfaced via the initialize handshake. */
  version?: string;
  /** Returns the per-user scoped DB on each tool call. */
  getDb: () => UserScopedDb;
}

export function createServer(opts: CreateServerOptions): McpServer {
  const server = new McpServer(
    {
      name: opts.name ?? '@speediance/mcp-server',
      version: opts.version ?? '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Speediance training data for the authenticated user. ' +
        'Read tools surface workouts + exercise history; proposeWorkout saves a builder draft; ' +
        'logCoachingNote persists a memory the in-app coach will also see. ' +
        'All writes are user-scoped via the SPEEDIANCE_USER_ID env var the server was launched with.',
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args) => {
        const db = opts.getDb();
        const result = await tool.handler(db, (args ?? {}) as Record<string, unknown>);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );
  }

  return server;
}
