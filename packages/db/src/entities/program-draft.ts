import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * Multi-week program — a template the user fills with `WorkoutDraft`s
 * arranged into weekly slots. Distinct from a Speediance `exclusivePlan`
 * (program-by-program-prescribers); this is the user's own plan they
 * can edit, schedule at any start date, and re-cycle.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = PROGRAM_DRAFT#{programId}
 *
 * **Slot model:** programs are templates over weeks. Each slot says
 * "during week N, on day-of-week D, do WorkoutDraft X". When the user
 * schedules the program at a specific start date, we materialize each
 * slot to (date = startDate + N*7 + offsetForDayOfWeek(D)) and call
 * Speediance's scheduleWorkout for each materialized reservation.
 *
 * **Workout references vs. inline copies:** slots reference the
 * underlying `WorkoutDraft` by `draftId`. Editing the workout once
 * propagates to every program using it. Trade-off: deleting a workout
 * leaves dangling references; the editor surfaces missing-draft
 * warnings so the user can fix them before scheduling.
 *
 * **Status lifecycle:**
 *   - `draft` — being assembled, no reservations on Speediance yet.
 *   - `scheduled` — the materialization step ran successfully and
 *     `scheduledReservations` holds the (date, templateId) pairs we
 *     created. Re-scheduling is allowed: clears old reservations,
 *     materializes new ones.
 */
export function programDraftEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'programDraft', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        programId: { type: 'string', required: true, readOnly: true },
        name: { type: 'string', required: true },
        notes: { type: 'string' },
        weekCount: { type: 'number', required: true, default: 1 },
        slots: {
          type: 'list',
          items: {
            type: 'map',
            properties: {
              weekIndex: { type: 'number', required: true },
              dayOfWeek: { type: 'number', required: true }, // 0=Sun..6=Sat
              draftId: { type: 'string', required: true },
              /** Optional override of the slot label — defaults to the
               *  workout draft's name. Useful when the same workout
               *  represents different phases ("Heavy day" vs "Volume day"
               *  from the same template). */
              label: { type: 'string' },
            },
          },
          required: true,
        },
        status: {
          type: ['draft', 'scheduled'] as const,
          default: 'draft',
        },
        scheduledStartDate: { type: 'string' }, // YYYY-MM-DD
        scheduledReservations: {
          type: 'list',
          items: {
            type: 'map',
            properties: {
              date: { type: 'string', required: true },
              templateId: { type: 'number', required: true },
              templateCode: { type: 'string' },
              draftId: { type: 'string' },
            },
          },
        },
        createdAt: { type: 'string', required: true, readOnly: true },
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
            composite: ['programId'],
            template: 'PROGRAM_DRAFT#${programId}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ProgramDraftEntity = ReturnType<typeof programDraftEntity>;
