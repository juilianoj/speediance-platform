import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Pre-computed weekly aggregate. Roadmap §3 puts the dashboard's hot reads on
 * these — the alternative (scanning raw WORKOUT/SET items) costs O(N) per
 * KPI card refresh. The sync worker recomputes these after each pull.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = AGG#WEEK#{weekIso}
 *
 * GSI2 (sparse): per-user weekly traversal — "give me the last 12 weeks of
 * volume" without a full SK scan.
 *   GSI2PK = USER#{userId}#WEEK
 *   GSI2SK = {weekIso}
 */
export function weekAggregateEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'agg-week', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        weekIso: { type: 'string', required: true, readOnly: true },
        totalVolume: { type: 'number' },
        totalCalories: { type: 'number' },
        totalMiles: { type: 'number' },
        scheduledCount: { type: 'number' },
        completedCount: { type: 'number' },
        missedCount: { type: 'number' },
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
            composite: ['weekIso'],
            template: 'AGG#WEEK#${weekIso}',
            casing: 'none',
          },
        },
        byWeek: {
          index: 'gsi2',
          pk: {
            field: 'gsi2pk',
            composite: ['userId'],
            template: 'USER#${userId}#WEEK',
            casing: 'none',
          },
          sk: {
            field: 'gsi2sk',
            composite: ['weekIso'],
            template: '${weekIso}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type WeekAggregateEntity = ReturnType<typeof weekAggregateEntity>;

/** Per-Speediance-cycle aggregate. Cycles are user-defined training blocks
 *  (typically 4–8 weeks). Numbered sequentially per user. */
export function cycleAggregateEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'agg-cycle', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        cycleNumber: { type: 'number', required: true, readOnly: true },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        totalVolume: { type: 'number' },
        totalCalories: { type: 'number' },
        scheduledCount: { type: 'number' },
        completedCount: { type: 'number' },
        missedCount: { type: 'number' },
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
            composite: ['cycleNumber'],
            template: 'AGG#CYCLE#${cycleNumber}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type CycleAggregateEntity = ReturnType<typeof cycleAggregateEntity>;

/** Per-muscle-group rolling totals. Year-to-date and current-cycle stored
 *  on the same item so the Muscle Balance page is a single GetItem. */
export function muscleAggregateEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'agg-muscle', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        muscleGroup: { type: 'string', required: true, readOnly: true },
        setsYtd: { type: 'number' },
        volumeYtd: { type: 'number' },
        setsCurrentCycle: { type: 'number' },
        volumeCurrentCycle: { type: 'number' },
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
            composite: ['muscleGroup'],
            template: 'AGG#MUSCLE#${muscleGroup}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type MuscleAggregateEntity = ReturnType<typeof muscleAggregateEntity>;
