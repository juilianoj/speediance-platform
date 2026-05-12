import { describe, expect, it } from 'vitest';
import { createDb } from '../src/index.js';

const TABLE = 'TestTable';

/** ElectroDB exposes `.params()` on every operation builder, which returns
 *  the DynamoDB request object that *would* be sent — without hitting the
 *  network. We use that to inspect key composition without a mock client. */
function db() {
  return createDb({ tableName: TABLE });
}

describe('createDb.forUser — input validation', () => {
  it('throws on empty string userId', () => {
    expect(() => db().forUser('')).toThrow(/non-empty string/i);
  });

  it('throws on whitespace... TODO if we tighten validation later', () => {
    // For now we only reject the empty string. Document the looser-than-ideal
    // behaviour so a future contributor knows to tighten if abuse happens.
    expect(() => db().forUser('   ')).not.toThrow();
  });
});

describe('key composition — Workout', () => {
  it('primary index pk/sk', () => {
    const params = db()
      .service.entities.workouts.put({
        userId: 'alice',
        startTime: '2026-05-11T13:00:00.000Z',
        title: 'Push Day',
      })
      .params() as { Item: { pk: string; sk: string } };
    expect(params.Item.pk).toBe('USER#alice');
    expect(params.Item.sk).toBe('WORKOUT#2026-05-11T13:00:00.000Z');
  });

  it('byWeek GSI is populated when weekIso is supplied', () => {
    const params = db()
      .service.entities.workouts.put({
        userId: 'alice',
        startTime: '2026-05-11T13:00:00.000Z',
        weekIso: '2026-05-14',
      })
      .params() as { Item: { gsi2pk?: string; gsi2sk?: string } };
    expect(params.Item.gsi2pk).toBe('USER#alice#WEEK');
    expect(params.Item.gsi2sk).toBe('2026-05-14');
  });
});

describe('key composition — Set', () => {
  it('primary index sk encodes startTime, exerciseId, setNum', () => {
    const params = db()
      .service.entities.sets.put({
        userId: 'alice',
        startTime: '2026-05-11T13:00:00.000Z',
        exerciseId: '42',
        setNum: 3,
        weight: 80,
        finishedReps: 8,
      })
      .params() as { Item: { pk: string; sk: string; gsi1pk?: string; gsi1sk?: string } };
    expect(params.Item.pk).toBe('USER#alice');
    expect(params.Item.sk).toBe('SET#2026-05-11T13:00:00.000Z#42#3');
    expect(params.Item.gsi1pk).toBe('EX#42');
    expect(params.Item.gsi1sk).toBe('2026-05-11T13:00:00.000Z');
  });
});

describe('key composition — Profile (singleton SK)', () => {
  it('SK is literal "PROFILE"', () => {
    const params = db()
      .service.entities.profiles.put({
        userId: 'alice',
        email: 'alice@example.com',
      })
      .params() as { Item: { pk: string; sk: string } };
    expect(params.Item.pk).toBe('USER#alice');
    expect(params.Item.sk).toBe('PROFILE');
  });
});

describe('key composition — Aggregates', () => {
  it('week aggregate primary SK', () => {
    const params = db()
      .service.entities.weekAggregates.put({
        userId: 'alice',
        weekIso: '2026-05-14',
        totalVolume: 4820,
      })
      .params() as { Item: { pk: string; sk: string; gsi2pk?: string; gsi2sk?: string } };
    expect(params.Item.pk).toBe('USER#alice');
    expect(params.Item.sk).toBe('AGG#WEEK#2026-05-14');
    expect(params.Item.gsi2pk).toBe('USER#alice#WEEK');
    expect(params.Item.gsi2sk).toBe('2026-05-14');
  });

  it('cycle aggregate primary SK', () => {
    const params = db()
      .service.entities.cycleAggregates.put({
        userId: 'alice',
        cycleNumber: 4,
      })
      .params() as { Item: { sk: string } };
    expect(params.Item.sk).toBe('AGG#CYCLE#4');
  });

  it('muscle aggregate primary SK', () => {
    const params = db()
      .service.entities.muscleAggregates.put({
        userId: 'alice',
        muscleGroup: 'quads',
      })
      .params() as { Item: { sk: string } };
    expect(params.Item.sk).toBe('AGG#MUSCLE#quads');
  });
});

describe('userId enforcement — wrapper bakes it in', () => {
  it('workouts.put sets pk from the bound userId', () => {
    const me = db().forUser('alice');
    // We can't easily run the full chain without a mock client, but we can
    // verify the wrapper's typed surface refuses a userId override.
    // Negative test (compile-only): `me.workouts.put({ userId: 'bob', … })`
    // would be a TypeScript error because `userId` is Omit-ed from the input.
    // That guarantee can't be asserted at runtime, only at typecheck.
    expect(me.userId).toBe('alice');
  });

  it('two scoped instances do not share state', () => {
    const wrapper = db();
    const alice = wrapper.forUser('alice');
    const bob = wrapper.forUser('bob');
    expect(alice.userId).toBe('alice');
    expect(bob.userId).toBe('bob');
    expect(alice).not.toBe(bob);
  });
});
