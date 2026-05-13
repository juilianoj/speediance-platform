# @speediance/mcp-server

Local MCP (Model Context Protocol) server that exposes a slice of the
Speediance AI Coach tools over **stdio**, so Claude Desktop on your Mac
can chat with your own training data.

This server is a thin shim over `@speediance/db` — it reads and writes
DynamoDB directly using your Mac's AWS credentials, and never opens a
network listener. There is nothing to deploy; you install it and Claude
Desktop spawns it as a child process whenever a chat session starts.

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

## Development

```bash
pnpm --filter @speediance/mcp-server typecheck
pnpm --filter @speediance/mcp-server lint
pnpm --filter @speediance/mcp-server test
```

The tests boot the server against an `InMemoryTransport` (no stdio,
no DDB) and exercise the tools via the MCP `Client` class. Use them as
the integration smoke-test for any tool change.

---

## License

MIT — same as the rest of the repo.
