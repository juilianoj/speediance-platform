# infra

SST Ion stacks for `speediance-platform`. One file per stack; assembled in
[`sst.config.ts`](./sst.config.ts).

| Stack      | File                                             | Status (Phase 0)                                       |
| ---------- | ------------------------------------------------ | ------------------------------------------------------ |
| Database   | [`stacks/Database.ts`](./stacks/Database.ts)     | Empty single-table; columns expand in Phase 0.4        |
| Auth       | [`stacks/Auth.ts`](./stacks/Auth.ts)             | Empty Cognito pool + Web client; invite flow Phase 0.3 |
| Api        | [`stacks/Api.ts`](./stacks/Api.ts)               | Bare Router; Hono handlers wire in Phase 1.x           |
| SyncWorker | [`stacks/SyncWorker.ts`](./stacks/SyncWorker.ts) | Lambda + 10:00 UTC daily Cron; stub handler            |
| Web        | [`stacks/Web.ts`](./stacks/Web.ts)               | Nextjs construct pointed at the placeholder app        |

## Running

> The roadmap calls this "SST v3 on AWS CDK." SST has since absorbed Ion into
> its main version line. We pin to `sst@^3.19.0` (Ion-era) for stability; the
> config syntax in this directory is forward-compatible with `sst@^4.x` should
> we bump.

```bash
# First-time setup: generates .sst/platform/config.d.ts with the real types
pnpm exec sst install

# Deploy a dev stage (uses your local AWS profile)
pnpm deploy:dev

# Tear it down
pnpm exec sst remove --stage dev
```

## A note on `tsc`

`sst.config.ts` and the files in `stacks/` use SST's generated globals
(`$config`, `sst.aws.*`). Until you run `sst install`, those globals don't
exist in `.sst/platform/`. We ship a deliberately loose stub at
[`sst.globals.d.ts`](./sst.globals.d.ts) so `pnpm typecheck` is green from a
clean clone. Once `sst install` runs, the real types in `.sst/` take precedence
and you get real autocomplete.
