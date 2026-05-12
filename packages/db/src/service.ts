import { Service } from 'electrodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { workoutEntity } from './entities/workout.js';
import { setEntity } from './entities/set.js';
import { exerciseEntity } from './entities/exercise.js';
import {
  cycleAggregateEntity,
  muscleAggregateEntity,
  weekAggregateEntity,
} from './entities/aggregate.js';
import { programEntity } from './entities/program.js';
import { memoryEntity } from './entities/memory.js';
import { profileEntity } from './entities/profile.js';
import { getDynamoClient } from './client.js';

export interface DbConfig {
  /** Real DynamoDB table name. In Lambda this comes from `Resource.Table.name`
   *  (SST auto-binds when the function is `link`-ed to the table). */
  tableName: string;
  /** Optional override — tests pass a mocked client; Lambda uses the default. */
  client?: DynamoDBDocumentClient;
}

/** Constructs the ElectroDB Service. All entities share the same table and
 *  client, so they can be queried jointly via `service.collections`. */
export function createService(opts: DbConfig) {
  const cfg = {
    table: opts.tableName,
    client: opts.client ?? getDynamoClient(),
  };

  return new Service({
    workouts: workoutEntity(cfg),
    sets: setEntity(cfg),
    exercises: exerciseEntity(cfg),
    weekAggregates: weekAggregateEntity(cfg),
    cycleAggregates: cycleAggregateEntity(cfg),
    muscleAggregates: muscleAggregateEntity(cfg),
    programs: programEntity(cfg),
    memories: memoryEntity(cfg),
    profiles: profileEntity(cfg),
  });
}

export type DbService = ReturnType<typeof createService>;
