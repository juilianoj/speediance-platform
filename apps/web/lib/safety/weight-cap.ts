/**
 * Hard safety cap on suggested weights (roadmap §3.6).
 *
 * The AI Coach (and the heuristic next-session recommender) can never
 * propose a weight greater than `min(1.05 × bestWt, 1.15 × workingWt)`
 * for an exercise the user has history on. This is enforced in code,
 * not just in the system prompt — a jailbreak / prompt injection should
 * not be able to surface a dangerous load.
 *
 * When neither `bestWeight` nor `workingWeight` is known (fresh users,
 * brand-new exercise), the cap is bypassed and the original suggestion
 * passes through — there is no history to bound it.
 *
 * The cap is intentionally generous: 5% above an all-time PR, 15% above
 * the current working load. It catches the runaway case (e.g. model
 * suggesting 2× working weight) without micromanaging normal progression.
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

/**
 * Compute the cap for one exercise. Returns undefined when neither bound
 * is available — callers should let the input through unmodified in that
 * case (no history to gate against).
 */
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

/**
 * Apply the cap to a single weight. Pass-through when there is no history
 * to bound against; clamp otherwise. Rounds the clamped weight to the
 * nearest 0.5 lb so we don't emit awkward fractional weights downstream.
 */
export function clampWeight(weight: number, history: WeightCapHistory): CapResult {
  if (!Number.isFinite(weight) || weight <= 0) return { weight, capped: false };
  const cap = maxSafeWeight(history);
  if (cap === undefined || weight <= cap) return { weight, capped: false };
  const rounded = Math.round(cap * 2) / 2;
  return { weight: rounded, capped: true, capValue: rounded };
}
