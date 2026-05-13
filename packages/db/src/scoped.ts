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
    /** Partial update — preserves fields not present in `input`. Use this
     *  for single-field toggles so we don't have to round-trip the full
     *  profile through a read-then-put cycle (which historically clobbered
     *  fields we forgot to carry over). */
    patch: (input: Partial<Put<'profiles'>>) => Promise<unknown>;
  };

  workouts: {
    list: () => Promise<unknown>;
    listWeek: (weekIso: string) => Promise<unknown>;
    put: (input: Put<'workouts'>) => Promise<unknown>;
    get: (startTime: string) => Promise<unknown>;
  };

  sets: {
    forWorkout: (startTime: string) => Promise<unknown>;
    /** Every set the user has logged, across all workouts. Cheap at family
     *  scale (~750 items per user); add a more selective access pattern
     *  when this becomes hot. */
    listAll: () => Promise<unknown>;
    put: (input: Put<'sets'>) => Promise<unknown>;
    /** Remove every Set item for a workout — used by the sync worker so a
     *  re-pull cleans up exercises that no longer appear in the upstream
     *  response (otherwise prior writes accumulate as ghost rows). */
    deleteForWorkout: (startTime: string) => Promise<void>;
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

  feedback: {
    list: () => Promise<unknown>;
    put: (input: Put<'feedback'>) => Promise<unknown>;
  };

  notes: {
    /** Notes attached to one target (a workout startTime or an exerciseId).
     *  Ordered ascending by createdAt — UI typically reverses for newest-first. */
    forTarget: (targetType: 'workout' | 'exercise', targetId: string) => Promise<unknown>;
    put: (input: Put<'notes'>) => Promise<unknown>;
    delete: (
      targetType: 'workout' | 'exercise',
      targetId: string,
      createdAt: string,
    ) => Promise<unknown>;
  };

  workoutDrafts: {
    list: () => Promise<unknown>;
    get: (draftId: string) => Promise<unknown>;
    upsert: (input: Put<'workoutDrafts'>) => Promise<unknown>;
    /** Partial update — preserves attributes not in `input`. Used for
     *  incremental edits in the builder (rename, swap exercise, etc.)
     *  without round-tripping the whole document. */
    patch: (draftId: string, input: Partial<Put<'workoutDrafts'>>) => Promise<unknown>;
    delete: (draftId: string) => Promise<unknown>;
  };

  programDrafts: {
    list: () => Promise<unknown>;
    get: (programId: string) => Promise<unknown>;
    upsert: (input: Put<'programDrafts'>) => Promise<unknown>;
    patch: (programId: string, input: Partial<Put<'programDrafts'>>) => Promise<unknown>;
    delete: (programId: string) => Promise<unknown>;
  };
}

/**
 * Global (non-user-scoped) data accessors. Used for things every user
 * shares — currently the Speediance exercise catalog. The wrapper keeps
 * the access pattern consistent (no direct ElectroDB calls outside this
 * package) without forcing a `userId` argument for data that isn't
 * actually per-user.
 */
export interface GlobalDb {
  exerciseCatalog: {
    get: (groupId: string) => Promise<unknown>;
    list: () => Promise<unknown>;
    upsert: (input: Put<'exerciseCatalog'>) => Promise<unknown>;
    /** Bulk write — used by the bootstrap job to insert ~500 rows in
     *  batches without hammering the table. ElectroDB's bulk-put fans out
     *  to BatchWrite under the hood (25 items per request). */
    bulkUpsert: (inputs: Array<Put<'exerciseCatalog'>>) => Promise<unknown>;
  };
}

export interface CreatedDb {
  readonly service: DbService;
  readonly global: GlobalDb;
  forUser(userId: string): UserScopedDb;
}

export function createDb(opts: DbConfig): CreatedDb {
  const service = createService(opts);
  const { entities: globalEntities } = service;

  const global: GlobalDb = {
    exerciseCatalog: {
      get: (groupId) => globalEntities.exerciseCatalog.get({ groupId }).go(),
      list: () => globalEntities.exerciseCatalog.query.primary({}).go({ pages: 'all' }),
      upsert: (input) =>
        globalEntities.exerciseCatalog
          .put(input as CreateEntityItem<Entities['exerciseCatalog']>)
          .go(),
      bulkUpsert: (inputs) =>
        globalEntities.exerciseCatalog
          .put(inputs as Array<CreateEntityItem<Entities['exerciseCatalog']>>)
          .go(),
    },
  };

  return {
    service,
    global,
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
          patch: (input) =>
            // ElectroDB `patch` updates only the supplied attributes,
            // leaving the rest untouched. Casting the input here because
            // ElectroDB's typed update signature is more restrictive than
            // Partial<Put<>> at the type level.
            entities.profiles
              .patch({ userId })
              .set(input as Partial<CreateEntityItem<Entities['profiles']>>)
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
          listAll: () => entities.sets.query.primary({ userId }).go({ pages: 'all' }),
          put: (input) =>
            entities.sets.put({ ...input, userId } as CreateEntityItem<Entities['sets']>).go(),
          deleteForWorkout: async (startTime) => {
            // ElectroDB doesn't have a Query+Delete chain, so we fetch the
            // primary keys and BatchWrite delete them. Set count per
            // workout is small (~30 max) so a single batch is enough.
            const result = (await entities.sets.query
              .primary({ userId, startTime })
              .go({ pages: 'all' })) as {
              data: Array<{ exerciseId: string; setNum: number }>;
            };
            if (result.data.length === 0) return;
            await entities.sets
              .delete(
                result.data.map((s) => ({
                  userId,
                  startTime,
                  exerciseId: s.exerciseId,
                  setNum: s.setNum,
                })),
              )
              .go();
          },
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

        feedback: {
          list: () => entities.feedback.query.primary({ userId }).go({ pages: 'all' }),
          put: (input) =>
            entities.feedback
              .put({ ...input, userId } as CreateEntityItem<Entities['feedback']>)
              .go(),
        },

        notes: {
          forTarget: (targetType, targetId) =>
            entities.notes.query.primary({ userId, targetType, targetId }).go({ pages: 'all' }),
          put: (input) =>
            entities.notes.put({ ...input, userId } as CreateEntityItem<Entities['notes']>).go(),
          delete: (targetType, targetId, createdAt) =>
            entities.notes.delete({ userId, targetType, targetId, createdAt }).go(),
        },

        workoutDrafts: {
          list: () => entities.workoutDrafts.query.primary({ userId }).go({ pages: 'all' }),
          get: (draftId) => entities.workoutDrafts.get({ userId, draftId }).go(),
          upsert: (input) =>
            entities.workoutDrafts
              .put({ ...input, userId } as CreateEntityItem<Entities['workoutDrafts']>)
              .go(),
          patch: (draftId, input) =>
            entities.workoutDrafts
              .patch({ userId, draftId })
              .set(input as Partial<CreateEntityItem<Entities['workoutDrafts']>>)
              .go(),
          delete: (draftId) => entities.workoutDrafts.delete({ userId, draftId }).go(),
        },

        programDrafts: {
          list: () => entities.programDrafts.query.primary({ userId }).go({ pages: 'all' }),
          get: (programId) => entities.programDrafts.get({ userId, programId }).go(),
          upsert: (input) =>
            entities.programDrafts
              .put({ ...input, userId } as CreateEntityItem<Entities['programDrafts']>)
              .go(),
          patch: (programId, input) =>
            entities.programDrafts
              .patch({ userId, programId })
              .set(input as Partial<CreateEntityItem<Entities['programDrafts']>>)
              .go(),
          delete: (programId) => entities.programDrafts.delete({ userId, programId }).go(),
        },
      };
    },
  };
}
