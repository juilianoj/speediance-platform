import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * User-authored workout draft. The atomic unit the builder produces and the
 * coach manipulates. Lives in our DDB so users can edit incrementally over
 * multiple sessions without losing state — pushing to Speediance is an
 * explicit save action that the user initiates.
 *
 * Keys
 *   PK = USER#{userId}
 *   SK = WORKOUT_DRAFT#{draftId}
 *
 * `draftId` is a ULID — alphanumeric, sortable by createdAt, no PII. We
 * generate it server-side so the URL the user lands on at /builder/[id]
 * doesn't depend on Speediance state.
 *
 * `status` flow:
 *   draft → saved-to-speediance (user clicked Save → we called
 *           saveWorkout API → got back a templateCode we store inline)
 *   saved-to-speediance → draft (user clicked Re-save after edits;
 *           we DELETE the previous Speediance template and POST a new one)
 *
 * `exercises` is a list of objects (ElectroDB supports nested list types).
 * Each exercise references a catalog groupId; sets carry the prescription.
 * We deliberately do NOT denormalise the exercise name / setup text from
 * the catalog into this row — the builder UI looks those up at read time
 * from the global catalog so we don't drift if Speediance updates an
 * exercise's setup instructions.
 */
export function workoutDraftEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'workoutDraft', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        draftId: { type: 'string', required: true, readOnly: true },
        name: { type: 'string', required: true },
        notes: { type: 'string' },
        exercises: {
          type: 'list',
          items: {
            type: 'map',
            properties: {
              // `groupId` references ExerciseCatalog.groupId.
              groupId: { type: 'string', required: true },
              // Per-set prescription. If every set uses the same weight + reps
              // the UI will offer a "uniform" mode that fills the array; the
              // shape stays the same on disk.
              sets: {
                type: 'list',
                items: {
                  type: 'map',
                  properties: {
                    reps: { type: 'number' },
                    weight: { type: 'number' },
                    restSeconds: { type: 'number' },
                  },
                },
                required: true,
              },
              // Optional override for the exercise's display order — when
              // absent we use the list-position index. Kept on the model so
              // future drag-and-drop reorder can persist without rebuilding
              // the whole list.
              orderHint: { type: 'number' },
              // Per-exercise notes — the coach uses this for "do these as a
              // superset with the next one".
              notes: { type: 'string' },
            },
          },
          required: true,
        },
        status: {
          type: ['draft', 'saved-to-speediance'] as const,
          default: 'draft',
        },
        speedianceTemplateCode: { type: 'string' },
        speedianceTemplateId: { type: 'number' },
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
            composite: ['draftId'],
            template: 'WORKOUT_DRAFT#${draftId}',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type WorkoutDraftEntity = ReturnType<typeof workoutDraftEntity>;
