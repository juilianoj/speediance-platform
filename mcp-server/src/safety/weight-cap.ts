/**
 * Hard safety cap on suggested weights (roadmap §3.6).
 *
 * Duplicated verbatim from `apps/web/lib/safety/weight-cap.ts` so the MCP
 * server can enforce the same invariant without depending on the web
 * app. The web file is the canonical source — if the cap formula changes
 * there, mirror it here. Both are small and have no external deps, so
 * keeping them in sync by inspection is cheaper than extracting a shared
 * package just for ~50 lines of code.
 *
 * The cap: a coach-proposed weight may never exceed
 *   min(1.05 × bestWeight, 1.15 × workingWeight)
 * for an exercise the user has history on. When no history exists the
 * cap is bypassed and the input passes through unchanged.
 */

export interface WeightCapHistory {
  bestWeight?: number;
  workingWeight?: number;
}

export interface CapResult {
  /** Possibly-clamped weight. */
  weight: number;
  /** True iff the cap reduced the input. */
  capped: boolean;
  /** Numeric cap that was applied, when capped. */
  capValue?: number;
}

const BEST_MULTIPLIER = 1.05;
const WORKING_MULTIPLIER = 1.15;

export function maxSafeWeight(history: WeightCapHistory): number | undefined {
  const bounds: number[] = [];
  if (typeof history.bestWeight === 'number' && history.bestWeight > 0) {
    bounds.push(history.bestWeight * BEST_MULTIPLIER);
  }
  if (typeof history.workingWeight === 'number' && history.workingWeight > 0) {
    bounds.push(history.workingWeight * WORKING_MULTIPLIER);
  }
  if (bounds.length === 0) return undefined;
  return Math.min(...bounds);
}

export function clampWeight(weight: number, history: WeightCapHistory): CapResult {
  if (!Number.isFinite(weight) || weight <= 0) return { weight, capped: false };
  const cap = maxSafeWeight(history);
  if (cap === undefined || weight <= cap) return { weight, capped: false };
  const rounded = Math.round(cap * 2) / 2;
  return { weight: rounded, capped: true, capValue: rounded };
}
