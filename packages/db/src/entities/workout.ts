import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * One completed (or scheduled-but-incomplete) Speediance workout session.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = WORKOUT#{startTime}
 *
 * GSI2 (sparse — populated only for completed workouts):
 *   GSI2PK = USER#{userId}#WEEK
 *   GSI2SK = {weekIso}    — the Thursday-of-week date string
 *
 * `startTime` is ISO-8601 with millisecond precision so it sorts lexically by
 * actual chronological order: e.g. `2026-05-11T13:00:00.000Z`.
 */
export function workoutEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'workout', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        startTime: { type: 'string', required: true, readOnly: true },
        templateCode: { type: 'string' },
        title: { type: 'string' },
        durationSeconds: { type: 'number' },
        totalCapacity: { type: 'number' }, // strength volume (lbs/kg×reps, untyped)
        // Mechanical work the Speediance reports in joules. The Google-Sheet
        // dashboard calls this "Output" and surfaces it both as a totals KPI
        // and as a per-minute intensity rate. Cardio sessions don't report it.
        outputJoules: { type: 'number' },
        calories: { type: 'number' },
        // Cardio-only fields. Walking/running sessions come back without an
        // `id` and with `sportType`/`mileage` populated instead of muscle
        // group breakdowns.
        distanceMiles: { type: 'number' },
        sportType: { type: 'number' },
        isCardio: { type: 'boolean' },
        // Muscle-group set counts captured from `trainingPartSetsInfoList`.
        // Stored as { "<trainingPartId2>": <set count> } so the dashboard
        // can render the "Volume by Muscle Group" bar chart without going
        // back to the (unreliable) detail endpoint.
        muscleGroupSets: {
          type: 'map',
          properties: {
            chest: { type: 'number' },
            shoulders: { type: 'number' },
            back: { type: 'number' },
            core: { type: 'number' },
            legs: { type: 'number' },
            arms: { type: 'number' },
          },
        },
        deviceType: { type: 'number' },
        cycle: { type: 'number' },
        weekIso: { type: 'string' }, // Thursday of the workout's ISO week
        completed: { type: 'boolean', default: false },
        // Speediance returns two IDs per session: `id` is the workout
        // instance, `trainingId` is the per-user session/template ID that
        // (via the cttTrainingInfoDetail endpoint) yields set-level data.
        // Keep both — `speedianceTrainingId` is the instance, the new
        // `speedianceTrainingTemplateId` is the one we'd pass to the
        // detail endpoint when (and if) we make it work reliably.
        speedianceTrainingId: { type: 'string' },
        speedianceTrainingTemplateId: { type: 'string' },
        speedianceTrainingType: { type: 'string' }, // 'course' | 'custom' | 'cardio'
        // Course/curriculum ID from Speediance — useful for grouping
        // "same workout, different sessions" (e.g. cycle comparisons).
        courseId: { type: 'number' },
        courseCategoryName: { type: 'string' },
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
            composite: ['startTime'],
            template: 'WORKOUT#${startTime}',
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

export type WorkoutEntity = ReturnType<typeof workoutEntity>;
