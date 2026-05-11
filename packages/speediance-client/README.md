# @speediance/speediance-client

TypeScript client for the Speediance mobile API. **Not affiliated with Speediance Inc.**

Ported (Phase 0.5 of the roadmap) from the open-source Python client
[`hbui3/UnofficialSpeedianceWorkoutManager`](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager).
Endpoint signatures mirror the Python original so it remains a useful
reference; intentional differences are listed below.

## Install

In-workspace:

```jsonc
// package.json
{
  "dependencies": {
    "@speediance/speediance-client": "workspace:*",
  },
}
```

## Usage

```ts
import { SpeedianceClient } from '@speediance/speediance-client';

// Empty client; callers persist credentials wherever they want (Secrets
// Manager in our case — never on disk).
const client = new SpeedianceClient(null, { region: 'Global' });
const login = await client.login(email, password);
if (!login.ok) throw new Error(login.reason);

// Subsequent calls reuse the credentials the login set on the instance.
const records = await client.getTrainingRecords('2026-05-01', '2026-05-31');
```

### Re-login on auth failure

The Speediance API rotates tokens aggressively and signals failure with
`code: 91` in a 200 body (not always HTTP 401). The client normalises both
into `SpeedianceUnauthorizedError`. Provide `onUnauthorized` to handle
refresh-and-retry transparently:

```ts
const client = new SpeedianceClient(currentCreds, {
  async onUnauthorized() {
    const fresh = await refreshFromSecretsManager();
    if (!fresh) return false;
    client.setCredentials(fresh);
    return true; // retry the original call once
  },
});
```

### Debug capture

```ts
new SpeedianceClient(creds, {
  onRequest: (debug) => logger.info(debug),
});
```

`onRequest` fires once per request with `{ method, url, status, requestHeaders,
requestBody, responseBody, timestamp }` — used by the admin panel and the
sync worker's audit log.

## Endpoint map

| Method                         | Endpoint                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `login(email, password)`       | POST `/api/app/v2/login/verifyIdentity` → POST `/api/app/v2/login/byPass`     |
| `logout()`                     | POST `/api/app/login/logout`                                                  |
| `updateUnit(unit)`             | PUT `/api/app/userinfo`                                                       |
| `getAccessories()`             | GET `/api/app/accessories/list`                                               |
| `getCategoriesForDevice(d)`    | GET `/api/app/actionLibraryTab/list?deviceType={d}`                           |
| `getExerciseDetail(id)`        | GET `/api/app/actionLibraryGroup/{id}?isDisplay=1`                            |
| `getBatchDetails(ids)`         | GET `/api/app/actionLibraryGroup/list?ids=…`                                  |
| `getUserActionStats(id, p, s)` | GET `/api/app/actionLibraryGroup/userActionStatPage?id=…&pageNo=…&pageSize=…` |
| `getUserWorkouts()`            | GET `/api/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1`         |
| `getWorkoutDetail(code)`       | GET `/api/app/v3/customTrainingTemplate/detailByCode?code=…`                  |
| `deleteWorkout(id)`            | DELETE `/api/app/customTrainingTemplate?ids={id}`                             |
| `saveWorkout(name, exercises)` | POST `/api/app/v2/customTrainingTemplate`                                     |
| `getCalendarMonth(date)`       | GET `/api/app/v5/trainingCalendar/monthNew?date={YYYY-MM}`                    |
| `scheduleWorkout(d, code, s)`  | POST `/api/app/templateReservation`                                           |
| `scheduleCourse(d, id, s)`     | POST `/api/app/courseReservation`                                             |
| `getTrainingRecords(s, e)`     | GET `/api/mobile/v2/report/userTrainingDataRecord?startDate=…&endDate=…`      |
| `getTrainingStats(s, e)`       | GET `/api/mobile/v2/report/userTrainingDataStat?startDate=…&endDate=…`        |
| `getTrainingDetail(id, type)`  | GET `/api/app/trainingInfo/{course\|ctt}TrainingInfoDetail/{id}`              |
| `getTrainingSessionInfo(id)`   | GET `/api/app/trainingInfo/courseTrainingInfo/{id}`                           |
| `getCoursesPage(p, ps)`        | GET `/api/app/v2/course/page?pageNo=…&pageSize=…`                             |
| `getCourseDetail(id)`          | GET `/api/app/v2/course/info/{id}?weightConfig=1`                             |
| `getProgramsPage(p, ps)`       | GET `/api/mobile/exclusivePlan/page?pageNo=…&pageSize=…`                      |
| `getProgramDetail(id)`         | GET `/api/app/exclusivePlan/{id}`                                             |

Regions: `Global` → `api2.speediance.com`, `EU` → `euapi.speediance.com`. All
authenticated requests carry the impersonation headers `Versioncode: 40304`,
`User-Agent: Dart/3.9 (dart:io)`, and a fixed `Mobiledevices` JSON blob. If
Speediance updates the official Android app, bump these constants in
[`src/types.ts`](./src/types.ts).

## Intentional differences from `hbui3/api_client.py`

| hbui3 Python                                          | Our TypeScript port                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reads & writes a local `config.json`                  | Stateless — caller supplies `Credentials` and persists (Secrets Manager)                                               |
| File-backed `library_cache_v2_*.json`                 | No cache; sync worker hits the API once per run (add cache only if needed)                                             |
| Stores `last_debug_info` on the instance              | Per-call `onRequest` callback — works without mutable instance state                                                   |
| `re.search`-style URL queries with no escaping        | Path params still raw (matches Python), but query values pass through `encodeURIComponent` where they're user-supplied |
| Returns `(False, reason, detail)` tuples from `login` | Returns `{ ok, reason?, detail?, credentials? }`                                                                       |

## Testing

```bash
pnpm --filter @speediance/speediance-client test
```

All tests run against recorded JSON fixtures in `tests/fixtures/`. **No CI job
talks to the live Speediance API.** A manual smoke test will live at
`scripts/smoke.ts` (added when we wire up the sync worker in Phase 1).

## License

[MIT](../../LICENSE). Not affiliated with, endorsed by, or sponsored by
Speediance Inc.
