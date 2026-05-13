import { describe, expect, it } from 'vitest';

import { clampWeight, maxSafeWeight } from '../lib/safety/weight-cap.js';

describe('maxSafeWeight', () => {
  it('returns undefined when no history is available', () => {
    expect(maxSafeWeight({})).toBeUndefined();
    expect(maxSafeWeight({ bestWeight: 0, workingWeight: 0 })).toBeUndefined();
  });

  it('uses 1.05 × bestWeight when only bestWeight is known', () => {
    expect(maxSafeWeight({ bestWeight: 200 })).toBeCloseTo(210);
  });

  it('uses 1.15 × workingWeight when only workingWeight is known', () => {
    expect(maxSafeWeight({ workingWeight: 100 })).toBeCloseTo(115);
  });

  it('returns the tighter of the two bounds when both are known', () => {
    // best=200 → 210, working=100 → 115. Tighter is 115.
    expect(maxSafeWeight({ bestWeight: 200, workingWeight: 100 })).toBeCloseTo(115);
    // best=100 → 105, working=200 → 230. Tighter is 105.
    expect(maxSafeWeight({ bestWeight: 100, workingWeight: 200 })).toBeCloseTo(105);
  });
});

describe('clampWeight', () => {
  it('passes the weight through when no history exists', () => {
    const result = clampWeight(500, {});
    expect(result.weight).toBe(500);
    expect(result.capped).toBe(false);
  });

  it('passes the weight through when it is at or below the cap', () => {
    const result = clampWeight(105, { bestWeight: 100, workingWeight: 100 });
    // Cap = min(105, 115) = 105 exactly.
    expect(result.weight).toBe(105);
    expect(result.capped).toBe(false);
  });

  it('clamps a runaway weight down to min(1.05 × best, 1.15 × working)', () => {
    const result = clampWeight(1000, { bestWeight: 200, workingWeight: 100 });
    // Cap = min(210, 115) = 115.
    expect(result.capped).toBe(true);
    expect(result.weight).toBe(115);
    expect(result.capValue).toBe(115);
  });

  it('rounds the clamped weight to the nearest 0.5 lb', () => {
    // best=33 → 34.65, working=10 → 11.5. Tighter is 11.5 (already a half-lb).
    const flatCase = clampWeight(50, { bestWeight: 33, workingWeight: 10 });
    expect(flatCase.weight).toBe(11.5);

    // best=37 → 38.85, working=200 → 230. Tighter is 38.85, rounds to 39.
    const roundsToWhole = clampWeight(80, { bestWeight: 37, workingWeight: 200 });
    expect(roundsToWhole.weight).toBe(39);

    // best=37.7 → 39.585, working=200 → 230. Tighter is 39.585, rounds to 39.5.
    const roundsToHalf = clampWeight(80, { bestWeight: 37.7, workingWeight: 200 });
    expect(roundsToHalf.weight).toBe(39.5);
  });

  it('passes invalid weights through unchanged', () => {
    expect(clampWeight(0, { bestWeight: 100, workingWeight: 100 })).toEqual({
      weight: 0,
      capped: false,
    });
    expect(clampWeight(-50, { bestWeight: 100, workingWeight: 100 })).toEqual({
      weight: -50,
      capped: false,
    });
    expect(clampWeight(NaN, { bestWeight: 100, workingWeight: 100 })).toMatchObject({
      capped: false,
    });
  });

  it("can't be bypassed by a prompt-injected huge weight (the spec)", () => {
    // Concretely: even if a coach response tries to push 999 lb on an
    // exercise where the user benches 135, the clamp brings it back to
    // 1.05 × 135 = 141.75 → 141.5.
    const result = clampWeight(999, { bestWeight: 135, workingWeight: 120 });
    expect(result.capped).toBe(true);
    expect(result.weight).toBeLessThanOrEqual(141.75);
  });
});
