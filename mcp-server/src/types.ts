/**
 * Shapes mirrored from `apps/web/lib/data/load-exercises.ts` and the
 * dashboard workout shape. We deliberately re-declare them here instead
 * of importing from the web app to keep this package's dependency graph
 * tight (no `apps/web` reverse-dep, no `next/server-only` poisoning).
 *
 * If a field changes upstream and our handlers start reading something
 * unexpected the tests will catch it — the underlying entity is what
 * actually governs the wire format, this type is just the projection
 * the MCP tools surface.
 */

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  muscleGroup?: string;
  isUnilateral?: boolean;
  bestWeight?: number;
  workingWeight?: number;
  lastDone?: string;
  totalSets?: number;
}

export interface ExerciseSet {
  startTime: string;
  exerciseId: string;
  setNum: number;
  weight?: number;
  startWeight?: number;
  endWeight?: number;
  finishedReps?: number;
  targetReps?: number;
  volume?: number;
  rest?: number;
  formFlags?: string[];
  leftRight?: string;
}

/** Subset of the workout shape used by `getLastSession`. */
export interface WorkoutRow {
  startTime: string;
  title?: string;
  isCardio?: boolean;
  speedianceTrainingType?: string;
  durationSeconds?: number;
  totalCapacity?: number;
  outputJoules?: number;
  calories?: number;
  distanceMiles?: number;
  muscleGroupSets?: Record<string, number>;
}
