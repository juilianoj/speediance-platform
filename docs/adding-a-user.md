# Adding a user

How to invite a family member into the platform end-to-end. Target: < 5 minutes from "send the invite" to "they see their own Dashboard." This is the admin runbook for [roadmap §4.6](../SPEEDIANCE_PLATFORM_ROADMAP.md.docx).

## Prerequisites

- You're signed in to the app as an admin.
- The family member has a Speediance account with their own email + password — i.e. they already use the official Speediance mobile app today.
- You know which API region their machine is on:
  - **Global** → `api2.speediance.com` (US / most of the world)
  - **EU** → `euapi.speediance.com`
  - If unsure, ask them — there is no auto-detect.

## Step 1 — Send the invite

1. Open `/admin`. The first card is **Invite a family member**.
2. Type their email address. Hit **Invite**.
3. Cognito sends them an email from SES (subject roughly _"Welcome to Speediance Platform — your temporary password"_). They get a one-shot temporary password.
4. The form shows _"Invited {email}"_ on success.

If the email never arrives:

- Check their spam folder.
- Check the Cognito console — was the user created? If yes, the email failed to send (SES sandbox limit, or SES from-address not verified). Resend by deleting the user in Cognito and re-inviting.
- See PRs #59–#63 for the SES → Cognito wiring if you need to debug the plumbing.

## Step 2 — They sign in for the first time

The invitee opens the app URL (`/login`) and:

1. Types their email + the temporary password from the invite email.
2. Cognito immediately prompts them to set a permanent password (12+ characters per the password policy).
3. Cognito then prompts them to enrol an authenticator app (MFA is enforced — TOTP only). They scan the QR code with Google Authenticator / 1Password / etc. and confirm the 6-digit code.

After that they land on `/dashboard`. The page will be empty — they have no Speediance data synced yet.

## Step 3 — Connect Speediance

The invitee opens `/profile` and fills in:

| Field               | What to put                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Speediance email    | Their Speediance account email.                                                                                      |
| Speediance password | Their Speediance account password. Required on first save; can be left blank on later edits to keep the current one. |
| Region              | `Global` or `EU` (see prereqs).                                                                                      |
| Device type         | `Pal / Gym Monster (1)` or `Monster 2 (2)`.                                                                          |
| Sync history from   | Default is `2018-01-01` — pulls all their history. Set to the date they got the machine for a faster first sync.     |
| Bodyweight / Units  | Optional; lets the Lift Log / Coach quote bodyweight-relative loads.                                                 |
| Gender              | Optional; only used to render the silhouette on `/balance`.                                                          |

On **Save and verify with Speediance**:

1. The action logs in to Speediance to validate the credentials. If they're wrong, the form shows _"Speediance rejected those credentials"_ and nothing is saved.
2. Valid creds are encrypted and stored in AWS Secrets Manager (one secret per Cognito user under `speediance-platform/{stage}/users/{userId}`).
3. The Profile DynamoDB row is upserted with their preferences + the secret ARN.
4. The sync worker is invoked immediately (Event mode), so they don't have to wait for the 10:00 UTC cron.

Note: connecting Speediance kicks any phone session that was logged in to the same Speediance account once. After that, the official phone app and our sync coexist — the token persists in Secrets Manager and we only re-login on a 401 (per [`apps/web/lib/speediance/refreshing-client.ts`](../apps/web/lib/speediance/refreshing-client.ts)).

## Step 4 — Wait for the first sync

The first sync is the slow one — it backfills every workout from `Sync history from` forward. Expect roughly:

- 30 s for a year of data
- 60 s for several years of data

The dashboard banner reads _"Syncing your Speediance history…"_ while it runs. Once `lastSyncedAt` flips, refresh and data appears.

If the sync is still empty after 2 min:

- Have the invitee return to `/profile` and check there's no error banner.
- As admin, hit **Resync me** on `/admin` — but only run it against your own account (it's the `resyncMe` action, scoped to the signed-in user).
- Check CloudWatch logs for `speediance-platform-{stage}-SyncWorkerFunction-*` for the relevant userId.

## Step 5 — They're live

Once data is synced the family member has the full app:

- `/dashboard` — KPIs, weekly volume, next session
- `/lift-log` — every exercise with PRs and recent sets
- `/coach` — AI chat + workout/program builder (Bedrock Claude Sonnet 4.6). Tip: have them set their coaching preferences on `/profile` (primary goal, sessions/week, constraints) — those persist and the coach uses them on every prompt.
- `/builder` — workout + program drafts they (or the coach) have created
- `/scheduled/[date]` — what's queued on their Speediance calendar
- `/balance`, `/consistency`, `/cardio` — secondary views

## Removing a user (manual for now)

There is no UI for this yet. To fully remove a family member:

1. Cognito console → delete the user (or just disable them).
2. DynamoDB console → delete the `PROFILE` row for `USER#{cognitoUserId}` (the `userId` is the Cognito `sub` UUID).
3. Secrets Manager console → delete the secret at `speediance-platform/{stage}/users/{cognitoUserId}`.

Workout history rows in DynamoDB can be left in place (no cost-meaningful difference at family scale) or batch-deleted via the AWS CLI if you want a hard scrub.
