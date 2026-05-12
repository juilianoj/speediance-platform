/**
 * Horizontal bar chart of total sets per muscle group over the last 30 days.
 * Pure server-rendered SVG (no `use client`) — fed the rolled-up totals from
 * `loadDashboard`. The trainingPartId2 → group mapping in the sync worker
 * is best-effort; if a group is missing here it's because the Speediance
 * API didn't tag it or the ID is unknown to us yet.
 */
import { MUSCLE_GROUP_ORDER, type MuscleGroupSets } from './load-dashboard';

const LABELS: Record<(typeof MUSCLE_GROUP_ORDER)[number], string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

const FILL = '#0b78d1';

export function MuscleGroupChart({ sets }: { sets: MuscleGroupSets }) {
  const rows = MUSCLE_GROUP_ORDER.map((g) => ({
    group: g,
    label: LABELS[g],
    value: sets[g] ?? 0,
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) {
    return <p style={{ color: '#888', margin: 0 }}>No muscle-group data in the last 30 days.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0;
        const barWidth = (r.value / max) * 100;
        return (
          <div
            key={r.group}
            style={{
              display: 'grid',
              gridTemplateColumns: '88px 1fr 64px',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ color: '#444' }}>{r.label}</span>
            <div
              style={{
                position: 'relative',
                height: '18px',
                background: '#f1f4f8',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: FILL,
                  opacity: 0.85,
                  transition: 'width 200ms ease',
                }}
              />
            </div>
            <span style={{ color: '#666', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {r.value} <span style={{ color: '#aaa' }}>({pct.toFixed(0)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
