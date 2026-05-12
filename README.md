# speediance-platform

> Self-hosted, AWS-native web app that replaces the official Speediance mobile app for daily use. Tracks workouts, generates personalized training programs with Claude, invite-shareable with family.

**Status:** Phase 0 (Foundation) in progress. See [`SPEEDIANCE_PLATFORM_ROADMAP.md.docx`](./SPEEDIANCE_PLATFORM_ROADMAP.md.docx) for the full plan.

This project is **not affiliated with, endorsed by, or sponsored by Speediance Inc.** It talks to the same public-facing Speediance mobile API the official app uses, using credentials you provide.

---

## What's here so far

| Path                         | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `apps/`                      | Future Next.js web app, Hono API router, sync worker Lambda           |
| `packages/speediance-client` | TypeScript client for the Speediance mobile API (ported from `hbui3`) |
| `packages/eslint-config`     | Shared ESLint flat config                                             |
| `infra/`                     | SST v3 stacks (Database, Auth, Web, Api, SyncWorker)                  |
| `.github/workflows/`         | CI (lint + typecheck + test on every PR) and deploy                   |
| `.gitleaks.toml`             | Secret-scan config; runs locally via husky and on every PR            |

---

## Quick start

Requirements: **Node ≥ 20**, **pnpm ≥ 9** (`brew install pnpm`), **gitleaks** for the pre-commit hook (`brew install gitleaks`). The hook hard-fails if gitleaks is missing — install before committing.

```bash
git clone https://github.com/juilianoj/speediance-platform.git
cd speediance-platform
pnpm install
cp .env.example .env.local        # fill in real values; never commit this file
pnpm typecheck
pnpm test
pnpm lint
```

To stand up your own AWS infra (Phase 0.2+):

```bash
aws configure --profile speediance
pnpm --filter infra exec sst deploy --stage dev
```

> The first deploy creates Cognito, DynamoDB, the SyncWorker Lambda, and an empty Next.js shell. Allow ~10 minutes.

### Setting up GitHub Actions OIDC (one-time per AWS account)

The `deploy.yml` workflow uses OIDC federation instead of long-lived AWS keys. Bootstrap the IAM role and provider once:

```bash
AWS_PROFILE=speediance ./scripts/bootstrap-oidc.sh
# The script prints the role ARN. Wire it up as a repo variable:
gh variable set AWS_DEPLOY_ROLE_ARN -b 'arn:aws:iam::<acct>:role/gha-speediance-deploy'
# Then in repo Settings → Secrets → Actions, delete any long-lived
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY secrets that predate OIDC.
```

---

## Speediance client

`packages/speediance-client` is a TypeScript port of [`hbui3/UnofficialSpeedianceWorkoutManager`](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager)'s `api_client.py`. It is **read-mostly** for our use case (workouts, history, calendar, library) plus the write paths for `customTrainingTemplate` and `templateReservation` that the AI Coach needs in Phase 3.

The client is exercised entirely against recorded JSON fixtures in CI. Live API round-trips are a manual step (`pnpm --filter @speediance/speediance-client run smoke -- --email … --password …`) and never run on PRs.

See [`packages/speediance-client/README.md`](./packages/speediance-client/README.md) for the endpoint map and design notes.

---

## Secrets policy

- **Never** commit `.env`, `.env.local`, AWS credentials, or any Speediance creds.
- `.env.example` lists every variable but only with placeholders.
- Runtime secrets live in **AWS Secrets Manager** (per-user Speediance creds) and **SSM Parameter Store** (app-level config like the Anthropic API key).
- A `gitleaks` pre-commit hook blocks accidental secret commits locally; GitHub Actions re-runs gitleaks on every PR.

If you think you've leaked a secret: rotate it immediately, then `git push --force` only after rotation.

---

## Working on this with Claude Code

Each phase from the roadmap is a self-contained Claude Code session. See [`docs/`](./docs) for subagent definitions and the kickoff prompt template.

```text
Read ROADMAP.md (and the .docx alongside it).
We are executing Phase {N}. Run tasks in parallel where dependencies allow.
Verify acceptance criteria. Have code-reviewer review before opening a PR.
```

---

## License

[MIT](./LICENSE).
