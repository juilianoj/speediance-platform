import { describe, expect, it } from 'vitest';

import { isMobilityScheduledItem } from '../lib/data/mobility-detection.js';
import type { ScheduledItem } from '../lib/data/load-scheduled.js';

function item(title: string): ScheduledItem {
  return { date: '2026-05-15', type: 'course', title };
}

describe('isMobilityScheduledItem', () => {
  it('flags obvious mobility titles', () => {
    expect(isMobilityScheduledItem(item('Yoga Flow'))).toBe(true);
    expect(isMobilityScheduledItem(item('Full-body mobility'))).toBe(true);
    expect(isMobilityScheduledItem(item('Pre-workout stretch'))).toBe(true);
    expect(isMobilityScheduledItem(item('Cooldown'))).toBe(true);
    expect(isMobilityScheduledItem(item('Pilates core'))).toBe(true);
  });

  it('matches case-insensitively + as substring', () => {
    expect(isMobilityScheduledItem(item('YOGA — restorative'))).toBe(true);
    expect(isMobilityScheduledItem(item('Hip Mobility · 15 min'))).toBe(true);
  });

  it('does NOT flag genuine lift workouts that happen to mention recovery', () => {
    // "recovery" alone is intentionally NOT in the keyword set — too
    // many lift workouts use it (e.g. "Recovery Push Day"). The
    // detector is supposed to under-tag rather than over-tag.
    expect(isMobilityScheduledItem(item('Recovery push day'))).toBe(false);
    expect(isMobilityScheduledItem(item('Strength A'))).toBe(false);
    expect(isMobilityScheduledItem(item('Bench + accessories'))).toBe(false);
  });

  it('handles missing or empty titles safely', () => {
    expect(isMobilityScheduledItem(item(''))).toBe(false);
    expect(isMobilityScheduledItem({ date: '2026-05-15', type: 'course' })).toBe(false);
  });
});
