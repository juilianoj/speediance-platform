# @speediance/mcp-server

Server-side MCP (Model Context Protocol) implementation exposing a slice
of the Speediance AI Coach tools. There are **two transport modes**:

1. **Stdio** (this package's `bin`) — Claude Desktop on your Mac spawns
   the server as a child process. The server talks to DynamoDB using
   your Mac's AWS creds. Lowest-latency, but tied to your machine.
2. **Remote HTTP/SSE** (`apps/api`, deployed by SST) — Claude Desktop
   talks to a Lambda Function URL over HTTPS, authenticated with a
   per-user opaque bearer token minted on `/profile`. Works from any
   machine; no AWS creds on the client.

Both modes share the same tool registry (`src/tools.ts`) and the same
`createServer({ getDb })` factory (`src/server.ts`). The transport is
chosen at the entry point.

> Roadmap reference: §3.9 ("MCP server for Claude Desktop").

---

## Tools exposed

| Tool                 | What it does                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `getLastSession`     | Most recent completed workout (title, date, duration, output kJ, calories, muscle-group sets).           |
| `getExerciseHistory` | Set-by-set history for one exercise — weight, reps, volume, form flags. Newest first.                    |
| `proposeWorkout`     | Saves a coach-proposed workout to the builder as a draft. Returns a `/builder/{draftId}` path to review. |
| `logCoachingNote`    | Persists a memory about the user — read by every future session, including the in-app web coach.         |

`proposeWorkout` runs the same server-side safety cap as the web coach:
no suggested weight may exceed `min(1.05 × bestWeight, 1.15 × workingWeight)`
for an exercise the user has history on. The clamp is enforced in code,
not just in the system prompt.

---

## Install

This package lives in the speediance-platform monorepo and is built
with pnpm:

```bash
pnpm install
pnpm --filter @speediance/mcp-server build
```

That produces a runnable `mcp-server/dist/index.js` with a shebang. The
`bin` field exposes it as `speediance-mcp` if the package is linked
globally (`pnpm --filter @speediance/mcp-server link --global`).

---

## Claude Desktop config

On macOS, edit `~/Library/Application Support/Claude/claude_desktop_config.json`
and add an `mcpServers.speediance` entry. The exact path to `dist/index.js`
depends on where you checked out the repo:

```json
{
  "mcpServers": {
    "speediance": {
      "command": "node",
      "args": ["/absolute/path/to/speediance-platform/mcp-server/dist/index.js"],
      "env": {
        "SPEEDIANCE_USER_ID": "<your Cognito sub>",
        "DYNAMO_TABLE_NAME": "<the deployed single-table name, e.g. speediance-dev-Table>",
        "AWS_PROFILE": "default",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

Restart Claude Desktop. The speediance tools should appear in the
tool-use UI on every chat.

### Required env

| Variable             | Where to get it                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SPEEDIANCE_USER_ID` | Your Cognito user `sub` (UUID). Pull it from the user pool console or from `aws cognito-idp admin-get-user`.            |
| `DYNAMO_TABLE_NAME`  | Output of the SST deploy, e.g. `speediance-dev-Table-XXXXXX`. Check `infra/sst-env.d.ts` or `aws dynamodb list-tables`. |
| `AWS_PROFILE`        | Any profile in `~/.aws/config` with DynamoDB GetItem/PutItem/Query on the table. `default` is fine.                     |
| `AWS_REGION`         | The region the table lives in.                                                                                          |

### Auth model

There is no per-request auth: anyone who can read your Claude Desktop
config can impersonate you against your own training data. The env var
**is** the auth.

This is acceptable because:

1. The config sits next to your AWS creds and your password manager —
   the threat model is identical.
2. The server only ever talks to your own user partition (`USER#{sub}`)
   in DynamoDB. Cross-tenant reads are structurally impossible — every
   query is routed through `@speediance/db`'s `forUser(userId)` wrapper.
3. Stdio is local-only by definition. No port is opened, no IAM is
   created, no API Gateway is provisioned.

If we ever expose this remotely, we'll add OAuth + per-request auth and
revisit. For "Jeff's Mac talking to Jeff's DDB" the env-var pattern is
the lowest-friction path.

---

## Remote (HTTP) mode

For chatting with your training data from a machine that doesn't have
AWS creds set up (a Windows laptop, an iPad over a remote desktop, etc),
deploy the HTTP wrapper in `apps/api/` and authenticate with a personal
API key minted on `/profile`.

### One-time setup

1. Deploy SST (`pnpm sst deploy --stage dev`). The output includes
   `mcpUrl`, an HTTPS URL like `https://<id>.lambda-url.us-west-2.on.aws/`.
2. Sign in to the web app and visit **`/profile` → Integrations → MCP
   API key → Generate key**. Copy the displayed value immediately — the
   UI only shows it once. The visible prefix on subsequent visits
   (`spd_xxxxxxxx…`) is just for "yes this is still my key" recognition.

### Claude Desktop config

Claude Desktop's HTTP transport entry uses the `url` field:

```json
{
  "mcpServers": {
    "speediance-remote": {
      "url": "https://<your-mcp-url>/mcp",
      "headers": {
        "Authorization": "Bearer spd_<your-key>"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the same four Speediance tools
appear in the tool-use UI as the local stdio install — the server-side
factory is shared.

### Curl smoke test

```bash
curl -s -X POST "https://<mcp-url>/mcp" \
  -H "Authorization: Bearer spd_<your-key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "clientInfo": {"name": "curl", "version": "0"},
      "capabilities": {}
    }
  }'
```

A `200` with a `result.serverInfo` block means auth + transport are
healthy. A `401` means the key wasn't recognised (typo? key revoked?
rotate it from `/profile` and try again).

### Security model (remote mode)

- The key is 36 chars (`spd_` + 32 url-safe base64). ~256 bits of
  entropy; brute-forcing it is not on the table.
- It's stored verbatim in DynamoDB (single-table; `PK=APIKEY#{key}`).
  DDB access is already perimeter-secured via IAM, and the cleartext
  store is the simplest thing that works for an MVP. If we ever go
  multi-tenant we'll HKDF-hash + store a verifier instead.
- The key value is **shown to the user exactly once**, at generation
  time. After that the UI only displays the prefix. Forgot it? Rotate.
- Rotation = `Generate` again on `/profile`. The old key stops working
  immediately (its reverse-lookup row is deleted).
- Server logs in CloudWatch contain only the prefix
  (`spd_xxxxxxxx…`), never the full key — see `apps/api/src/mcp-auth.ts`'s
  `redactKey()`.
- Every request still goes through the same `forUser(userId)` wrapper
  in `@speediance/db`, so cross-tenant reads remain structurally
  impossible.

---

## Development

```bash
pnpm --filter @speediance/mcp-server typecheck
pnpm --filter @speediance/mcp-server lint
pnpm --filter @speediance/mcp-server test
```

The tests boot the server against an `InMemoryTransport` (no stdio,
no DDB) and exercise the tools via the MCP `Client` class. Use them as
the integration smoke-test for any tool change.

The remote HTTP transport has its own tests under `apps/api/tests/`
that drive the Hono app via `app.request()` — they mock `@speediance/db`
and exercise auth + `initialize` + `tools/list` end-to-end.

---

## License

MIT — same as the rest of the repo.
