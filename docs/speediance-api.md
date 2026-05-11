# Speediance mobile API — endpoint map

This is the working map of the Speediance mobile API as observed in
[`hbui3/UnofficialSpeedianceWorkoutManager`](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager)'s
`api_client.py` and confirmed against `packages/speediance-client` fixture
tests. **All of this is implementation-level reverse engineering;** Speediance
does not publish a stable public API and may break anything below at any time.

For the canonical method-by-method list, see
[`packages/speediance-client/README.md`](../packages/speediance-client/README.md).
This document holds the operational notes — quirks, gotchas, and the
"why is this header here?" context.

## Regions & hosts

| Region | Host                   | Base URL                       |
| ------ | ---------------------- | ------------------------------ |
| Global | `api2.speediance.com`  | `https://api2.speediance.com`  |
| EU     | `euapi.speediance.com` | `https://euapi.speediance.com` |

Region is sticky per user; we read it from Cognito custom attributes and pin
the `SpeedianceClient` instance at construction.

## Required headers

Every call (login or authenticated):

```
Host:            api2.speediance.com         # or euapi.…
User-Agent:      Dart/3.9 (dart:io)
Content-Type:    application/json
Timestamp:       1715630400000                # ms epoch, fresh per request
Utc_offset:      +0000
Versioncode:     40304
Mobiledevices:   {"brand":"google","device":"emulator64_x86_64_arm64",…}
Timezone:        GMT
Accept-Language: en
App_type:        SOFTWARE
Connection:      keep-alive
Accept-Encoding: gzip, deflate, br
```

Authenticated calls add:

```
App_user_id:     {numeric user id from byPass response}
Token:           {opaque session token from byPass response}
```

The `Mobiledevices` field is a JSON-encoded _string_ the server parses out of
the header value. Drop it and you'll get a generic 403.

## Auth flow

1. `POST /api/app/v2/login/verifyIdentity` — body `{ type: 2, userIdentity: email }`
   - Returns `data.isExist` and `data.hasPwd`. Both must be `true` to continue.
2. `POST /api/app/v2/login/byPass` — body `{ userIdentity: email, password, type: 2 }`
   - Returns `data.token` and `data.appUserId`. Persist both.
3. Subsequent requests use `App_user_id` + `Token` headers.

The Speediance backend enforces a single active session per user. **Logging
in from a new client kicks the previous one off** — the phone gets booted on
first sync, after which both can coexist until something invalidates the
token. We handle that by persisting the token in Secrets Manager (Phase 1.5)
and re-logging in only on `code: 91` / HTTP 401.

## The `code: 91` sentinel

The wire format is `{ code, msg, data }` with `code === 0` for success. The
auth-failure code is **91**, and it is sometimes returned with HTTP 200 — so
status code alone is insufficient. The client normalises both `code: 91` and
HTTP 401 into a `SpeedianceUnauthorizedError`.

## Pagination

- `getUserWorkouts` uses `pageSize=-1` to fetch everything. The server respects
  it on the v4 endpoint and returns the entire list in one shot.
- Courses / programs use `pageSize=200` as their cap; callers should iterate
  pages until the response array is empty.
- `getUserActionStats` paginates with `pageNo` / `pageSize`; the Python client
  returns the full envelope from this endpoint (the wrapper data shape differs).

## Quirks worth knowing

- **Weight units on the wire are `lb × 2.2`.** Yes, that's not pounds-to-kg
  (×0.453). The official app double-converts somewhere; we match what
  `hbui3` does.
- **`saveWorkout` sends "dummy" weights for preset exercises.** When
  `preset_id != -1`, the real value goes in `counterweight2`, and the
  `weights` field must still be present with `3.5` per set or the server
  drops the counter. Both `counterweight` and `counterweight2` are sent.
- **`leftRight` alternates `1,2,1,2` only for unilateral exercises** (where
  `isLeftRight === 1`). Otherwise it's `0,…,0`.
- **`breakTime` is sent twice** as `breakTime` and `breakTime2`. The Python
  comment says "some backends expect both fields present." We mirror that.
- **`completionMethod` distinguishes time vs reps**: `2` for `unit==='sec'`,
  `1` for `unit==='reps'`. `countType` mirrors that 2/1 pair.

## Endpoint inventory

See `packages/speediance-client/README.md` for the full method-to-URL table.
Live test recordings (none in CI; manual smoke only) will land under
`scripts/recordings/` when added.
