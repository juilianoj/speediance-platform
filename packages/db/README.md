# @speediance/db

DynamoDB access layer for `speediance-platform`. Single-table model + ElectroDB entities + a **user-scoped wrapper that structurally enforces the `USER#{id}` partition rule** (roadmap §7, audit finding M4).

## Why a wrapper

Cross-user data leaks happen when a handler forgets to scope a query. Comment-driven rules don't survive refactors. So:

```ts
import { createDb } from '@speediance/db';

const db = createDb({ tableName: Resource.Table.name });
const me = db.forUser(currentUserId);

// All methods on `me` automatically include `userId: currentUserId`.
await me.workouts.put({ startTime, title /* no userId field */ });
const recent = await me.workouts.list();
```

The TypeScript surface **`Omit`-s `userId` from every method's input**, so this won't compile:

```ts
me.workouts.put({ userId: 'someone-else', startTime, title }); // ❌ TS error
```

Direct ElectroDB / DynamoDB client imports are blocked by ESLint `no-restricted-imports` everywhere outside this package — see the rule in [`packages/eslint-config/index.js`](../eslint-config/index.js).

## Single-table layout

One DynamoDB table; items distinguished by SK prefix.

| Item type  | PK              | SK                                      | Notes                                                |
| ---------- | --------------- | --------------------------------------- | ---------------------------------------------------- |
| Profile    | `USER#{userId}` | `PROFILE`                               | Singleton — one per user                             |
| Workout    | `USER#{userId}` | `WORKOUT#{startTime}`                   | `startTime` is ISO-8601 with ms precision            |
| Set        | `USER#{userId}` | `SET#{startTime}#{exerciseId}#{setNum}` | One per set within a workout                         |
| Exercise   | `USER#{userId}` | `EXERCISE#{exerciseId}`                 | Per-user metadata + last-done cache                  |
| Week agg   | `USER#{userId}` | `AGG#WEEK#{weekIso}`                    | Pre-computed weekly KPIs for the dashboard           |
| Cycle agg  | `USER#{userId}` | `AGG#CYCLE#{n}`                         | Per Speediance training cycle                        |
| Muscle agg | `USER#{userId}` | `AGG#MUSCLE#{group}`                    | YTD + current cycle totals per muscle group          |
| Program    | `USER#{userId}` | `PROGRAM#{programId}`                   | AI-generated program; `status` field gates promotion |
| Memory     | `USER#{userId}` | `MEMORY#{createdAt}`                    | Persistent coaching notes the AI Coach reads         |

### GSI1 — per-exercise history (sparse)

Populated only by `Set` items. Lets us answer "everything you've done for exercise 42, chronological" in a single Query.

- `GSI1PK = EX#{exerciseId}`
- `GSI1SK = {startTime}`

### GSI2 — per-user weekly traversal (sparse)

Populated by `Workout` and `WeekAggregate`. Powers the dashboard's volume-over-time chart without a full SK scan.

- `GSI2PK = USER#{userId}#WEEK`
- `GSI2SK = {weekIso}` (the Thursday of the ISO week)

`weekIso` uses the Thursday anchor because the ISO 8601 week always contains its Thursday, so the value is unambiguous regardless of week-start convention.

## Adding an entity

1. New file under [`src/entities/`](src/entities/) exporting a factory function `(config) => new Entity({...}, config)`.
2. Use literal `template:` strings for `pk`/`sk` so the key shape matches the table above (don't rely on ElectroDB's default service prefix).
3. Register it in [`src/service.ts`](src/service.ts) inside the `createService()` Service map.
4. Add a `forUser(userId)` accessor in [`src/scoped.ts`](src/scoped.ts) that `Omit`s `userId` from the public input.
5. Add a key-shape test in [`tests/scoped.test.ts`](tests/scoped.test.ts).

## Testing

```bash
pnpm --filter @speediance/db test
```

Tests use ElectroDB's `.params()` method to capture the would-be DynamoDB request without hitting the network. Live DynamoDB integration tests will live in `tests/integration/` once we have an emulator wired up — for now CI is fixture-only.

## License

[MIT](../../LICENSE).
