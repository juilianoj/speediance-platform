import type { CreateEntityItem } from 'electrodb';

import { createService, type DbConfig, type DbService } from './service.js';

/**
 * Structural enforcement of the "every query MUST include USER#{id}" rule
 * (audit finding M4 + roadmap §7 Risks). Every method on a `UserScopedDb`
 * automatically scopes to the userId the caller bound at construction time.
 *
 * **The only supported way to read or write tenant data is through this
 * wrapper.** Direct ElectroDB / DynamoDB calls are blocked by ESLint
 * `no-restricted-imports` outside this package.
 *
 * Usage:
 * ```ts
 * import { createDb } from '@speediance/db';
 *
 * const db = createDb({ tableName: Resource.Table.name });
 * const me = db.forUser('alice');
 *
 * await me.workouts.put({ startTime: '2026-05-11T13:00:00.000Z', title: 'Push' });
 * const recent = await me.workouts.list();
 * ```
 *
 * The TypeScript signature `Omit`-s `userId` from every method's input so
 * `me.workouts.put({ userId: 'bob', … })` is a compile-time error. The
 * userId comes exclusively from the binding on `forUser()`.
 */
type Entities = DbService['entities'];
type Put<K extends keyof Entities> = Omit<CreateEntityItem<Entities[K]>, 'userId'>;

export interface UserScopedDb {
  readonly userId: string;

  profiles: {
    get: () => Promise<unknown>;
    upsert: (input: Put<'profiles'>) => Promise<unknown>;
  };

  workouts: {
    list: () => Promise<unknown>;
    listWeek: (weekIso: string) => Promise<unknown>;
    put: (input: Put<'workouts'>) => Promise<unknown>;
    get: (startTime: string) => Promise<unknown>;
  };

  sets: {
    forWorkout: (startTime: string) => Promise<unknown>;
    put: (input: Put<'sets'>) => Promise<unknown>;
  };

  exercises: {
    list: () => Promise<unknown>;
    get: (exerciseId: string) => Promise<unknown>;
    upsert: (input: Put<'exercises'>) => Promise<unknown>;
  };

  weekAggregates: {
    list: () => Promise<unknown>;
    get: (weekIso: string) => Promise<unknown>;
    upsert: (input: Put<'weekAggregates'>) => Promise<unknown>;
  };

  cycleAggregates: {
    list: () => Promise<unknown>;
    get: (cycleNumber: number) => Promise<unknown>;
    upsert: (input: Put<'cycleAggregates'>) => Promise<unknown>;
  };

  muscleAggregates: {
    list: () => Promise<unknown>;
    get: (muscleGroup: string) => Promise<unknown>;
    upsert: (input: Put<'muscleAggregates'>) => Promise<unknown>;
  };

  programs: {
    list: () => Promise<unknown>;
    get: (programId: string) => Promise<unknown>;
    upsert: (input: Put<'programs'>) => Promise<unknown>;
  };

  memories: {
    list: () => Promise<unknown>;
    put: (input: Put<'memories'>) => Promise<unknown>;
  };
}

export interface CreatedDb {
  readonly service: DbService;
  forUser(userId: string): UserScopedDb;
}

export function createDb(opts: DbConfig): CreatedDb {
  const service = createService(opts);

  return {
    service,
    forUser(userId: string): UserScopedDb {
      if (!userId || typeof userId !== 'string') {
        throw new TypeError('createDb.forUser(userId): userId must be a non-empty string');
      }
      const { entities } = service;

      // ElectroDB's per-entity input types are highly generic; rather than
      // re-state each shape we let `Put<K>` from the interface above drive
      // the public contract and cast at the call site, where the spread of
      // `{ ...input, userId }` materialises the full entity record.
      return {
        userId,

        profiles: {
          get: () => entities.profiles.get({ userId }).go(),
          upsert: (input) =>
            entities.profiles
              .put({ ...input, userId } as CreateEntityItem<Entities['profiles']>)
              .go(),
        },

        workouts: {
          list: () => entities.workouts.query.primary({ userId }).go(),
          listWeek: (weekIso) => entities.workouts.query.byWeek({ userId, weekIso }).go(),
          put: (input) =>
            entities.workouts
              .put({ ...input, userId } as CreateEntityItem<Entities['workouts']>)
              .go(),
          get: (startTime) => entities.workouts.get({ userId, startTime }).go(),
        },

        sets: {
          forWorkout: (startTime) => entities.sets.query.primary({ userId, startTime }).go(),
          put: (input) =>
            entities.sets.put({ ...input, userId } as CreateEntityItem<Entities['sets']>).go(),
        },

        exercises: {
          list: () => entities.exercises.query.primary({ userId }).go(),
          get: (exerciseId) => entities.exercises.get({ userId, exerciseId }).go(),
          upsert: (input) =>
            entities.exercises
              .put({ ...input, userId } as CreateEntityItem<Entities['exercises']>)
              .go(),
        },

        weekAggregates: {
          list: () => entities.weekAggregates.query.byWeek({ userId }).go(),
          get: (weekIso) => entities.weekAggregates.get({ userId, weekIso }).go(),
          upsert: (input) =>
            entities.weekAggregates
              .put({ ...input, userId } as CreateEntityItem<Entities['weekAggregates']>)
              .go(),
        },

        cycleAggregates: {
          list: () => entities.cycleAggregates.query.primary({ userId }).go(),
          get: (cycleNumber) => entities.cycleAggregates.get({ userId, cycleNumber }).go(),
          upsert: (input) =>
            entities.cycleAggregates
              .put({ ...input, userId } as CreateEntityItem<Entities['cycleAggregates']>)
              .go(),
        },

        muscleAggregates: {
          list: () => entities.muscleAggregates.query.primary({ userId }).go(),
          get: (muscleGroup) => entities.muscleAggregates.get({ userId, muscleGroup }).go(),
          upsert: (input) =>
            entities.muscleAggregates
              .put({ ...input, userId } as CreateEntityItem<Entities['muscleAggregates']>)
              .go(),
        },

        programs: {
          list: () => entities.programs.query.primary({ userId }).go(),
          get: (programId) => entities.programs.get({ userId, programId }).go(),
          upsert: (input) =>
            entities.programs
              .put({ ...input, userId } as CreateEntityItem<Entities['programs']>)
              .go(),
        },

        memories: {
          list: () => entities.memories.query.primary({ userId }).go(),
          put: (input) =>
            entities.memories
              .put({ ...input, userId } as CreateEntityItem<Entities['memories']>)
              .go(),
        },
      };
    },
  };
}
