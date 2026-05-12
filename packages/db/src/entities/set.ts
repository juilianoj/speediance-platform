import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * One set within a workout. Form-flag and weight detail are captured per-set
 * so the dashboard's "Form ⚠" indicator can drill down.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = SET#{startTime}#{exerciseId}#{setNum}
 *
 * GSI1: per-exercise history. Sparse — only Set items populate gsi1.
 *   GSI1PK = EX#{exerciseId}
 *   GSI1SK = {startTime}
 *
 * That lets "give me everything I've done for exerciseId 42, in chronological
 * order" be a single Query against gsi1.
 */
export function setEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'set', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        startTime: { type: 'string', required: true, readOnly: true },
        exerciseId: { type: 'string', required: true, readOnly: true },
        setNum: { type: 'number', required: true, readOnly: true },
        weight: { type: 'number' },
        startWeight: { type: 'number' }, // for drop sets: the heavier opening weight
        endWeight: { type: 'number' },
        targetReps: { type: 'number' },
        finishedReps: { type: 'number' },
        volume: { type: 'number' }, // weight × reps, pre-computed at write
        rest: { type: 'number' },
        mode: { type: 'number' },
        unit: { type: 'string' }, // 'reps' | 'sec'
        leftRight: { type: 'string' }, // '0' bilateral, '1' left, '2' right
        formFlags: { type: 'list', items: { type: 'string' } }, // tip codes from Speediance
        createdAt: { type: 'string' },
        updatedAt: { type: 'string', watch: '*', set: () => new Date().toISOString() },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: ['userId'],
            template: 'USER#${userId}',
            casing: 'none',
          },
          sk: {
            field: 'sk',
            composite: ['startTime', 'exerciseId', 'setNum'],
            template: 'SET#${startTime}#${exerciseId}#${setNum}',
            casing: 'none',
          },
        },
        byExercise: {
          index: 'gsi1',
          pk: {
            field: 'gsi1pk',
            composite: ['exerciseId'],
            template: 'EX#${exerciseId}',
            casing: 'none',
          },
          sk: {
            field: 'gsi1sk',
            composite: ['startTime'],
            template: '${startTime}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type SetEntity = ReturnType<typeof setEntity>;
