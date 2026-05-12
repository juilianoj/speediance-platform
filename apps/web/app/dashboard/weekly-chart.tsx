/**
 * Hand-rolled stacked / overlaid bar chart for the weekly trend strip.
 * Inline SVG → no client JS, no extra deps. The user can pick a metric
 * (volume / output / calories) via the small toggle at the top.
 *
 * Why not a chart library: every bundle byte counts for the cold-start
 * Lambda → CloudFront → first-paint path, and a library here would add
 * 40-80 kB for 12 bars. We'll trade up to Recharts when we need real
 * tooltips, brushing, or zooming.
 */
'use client';

import { useState } from 'react';

import type { WeekBucket } from './load-dashboard';

type Metric = 'volume' | 'outputKj' | 'calories' | 'workouts';

const METRIC_LABELS: Record<Metric, string> = {
  volume: 'Volume',
  outputKj: 'Output (kJ)',
  calories: 'Calories',
  workouts: 'Workouts',
};

const METRIC_FILLS: Record<Metric, string> = {
  volume: '#0b78d1',
  outputKj: '#7c3aed',
  calories: '#dc2626',
  workouts: '#0d9488',
};

export function WeeklyChart({ weeks }: { weeks: WeekBucket[] }) {
  const [metric, setMetric] = useState<Metric>('volume');

  if (weeks.length === 0) {
    return <p style={{ color: '#888', margin: 0 }}>Not enough data yet.</p>;
  }

  const values = weeks.map((w) => weekValue(w, metric));
  const max = Math.max(...values, 1);
  const barWidth = 38;
  const gap = 12;
  const height = 180;
  const labelGap = 30;
  const totalWidth = weeks.length * (barWidth + gap);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.85rem',
              border: '1px solid',
              borderColor: m === metric ? METRIC_FILLS[m] : '#d0d0d0',
              borderRadius: '999px',
              background: m === metric ? METRIC_FILLS[m] : 'transparent',
              color: m === metric ? '#fff' : '#444',
              cursor: 'pointer',
              fontWeight: m === metric ? 600 : 400,
            }}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg
          width={totalWidth}
          height={height + labelGap}
          viewBox={`0 0 ${totalWidth} ${height + labelGap}`}
          aria-label={`Weekly ${METRIC_LABELS[metric]} bar chart`}
          role="img"
        >
          {weeks.map((w, i) => {
            const v = weekValue(w, metric);
            const h = Math.max(2, (v / max) * height);
            const x = i * (barWidth + gap);
            const y = height - h;
            return (
              <g key={w.weekIso}>
                <title>{`${w.label}: ${formatValue(v, metric)}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={3}
                  fill={METRIC_FILLS[metric]}
                  opacity={0.85}
                />
                <text
                  x={x + barWidth / 2}
                  y={height + 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#999"
                >
                  {w.label}
                </text>
                {v > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height + labelGap - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#666"
                  >
                    {compactNumber(v)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function weekValue(w: WeekBucket, m: Metric): number {
  if (m === 'volume') return w.volume;
  if (m === 'outputKj') return w.outputKj;
  if (m === 'calories') return w.calories;
  return w.workouts;
}

function formatValue(v: number, m: Metric): string {
  if (m === 'volume' || m === 'calories') return Math.round(v).toLocaleString();
  if (m === 'outputKj') return `${Math.round(v).toLocaleString()} kJ`;
  return `${v}`;
}

function compactNumber(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(v));
}
