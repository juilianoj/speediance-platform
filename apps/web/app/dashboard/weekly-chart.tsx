/**
 * Weekly trend chart. Fluid width so it fills the card; user-selectable
 * metric + date range. Inline SVG so we ship no client chart library.
 */
'use client';

import { useState } from 'react';

import type { WeekBucket } from './load-dashboard';

type Metric = 'volume' | 'outputKj' | 'calories' | 'workouts';
type Range = 4 | 8 | 12 | 26 | 52;

const METRIC_LABELS: Record<Metric, string> = {
  volume: 'Volume',
  outputKj: 'Output (kJ)',
  calories: 'Calories',
  workouts: 'Workouts',
};

const METRIC_FILLS: Record<Metric, string> = {
  volume: 'var(--accent)',
  outputKj: '#7c3aed',
  calories: 'var(--danger)',
  workouts: 'var(--success)',
};

const RANGE_LABELS: Record<Range, string> = {
  4: '1m',
  8: '2m',
  12: '3m',
  26: '6m',
  52: '1y',
};

export function WeeklyChart({ weeks }: { weeks: WeekBucket[] }) {
  const [metric, setMetric] = useState<Metric>('volume');
  const [range, setRange] = useState<Range>(12);

  if (weeks.length === 0) {
    return <p style={{ color: 'var(--text-faint)', margin: 0 }}>Not enough data yet.</p>;
  }

  // weeks is built oldest → newest (12 items by default in the loader);
  // slice the most recent `range` weeks.
  const view = weeks.slice(-range);
  const values = view.map((w) => weekValue(w, metric));
  const max = Math.max(...values, 1);

  // Fluid layout — the SVG uses a viewBox so it scales with the card.
  // 100 units wide × 100 units tall internal grid; container CSS handles
  // the actual pixel size.
  const W = 1000;
  const H = 220;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 38;
  const dateLabelY = H - padB + 14;
  const valueLabelY = H - padB + 30;
  const chartH = H - padT - padB;
  const slot = (W - padL - padR) / view.length;
  const barWidth = Math.min(slot * 0.7, 64);
  // At wider ranges there isn't room to print a date + value under every
  // bar without overlap. Keep every Nth label readable. For 6m/1y drop the
  // per-bar value label entirely — the hover tooltip still has it.
  const labelStride = view.length <= 12 ? 1 : view.length <= 16 ? 2 : view.length <= 30 ? 4 : 8;
  const showValueLabels = view.length <= 16;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '0.85rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              style={{
                padding: '0.35rem 0.85rem',
                fontSize: '0.85rem',
                border: '1px solid',
                borderColor: m === metric ? METRIC_FILLS[m] : 'var(--border-strong)',
                borderRadius: '999px',
                background: m === metric ? METRIC_FILLS[m] : 'transparent',
                color: m === metric ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: m === metric ? 600 : 500,
              }}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
          {(Object.keys(RANGE_LABELS) as unknown as string[]).map((rStr) => {
            const r = Number(rStr) as Range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  padding: '0.3rem 0.55rem',
                  fontSize: '0.78rem',
                  border: '1px solid',
                  borderColor: r === range ? 'var(--text)' : 'var(--border-strong)',
                  borderRadius: '4px',
                  background: r === range ? 'var(--text)' : 'transparent',
                  color: r === range ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: r === range ? 600 : 500,
                }}
              >
                {RANGE_LABELS[r]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ width: '100%' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-label={`Weekly ${METRIC_LABELS[metric]} bar chart`}
          role="img"
          style={{ display: 'block' }}
        >
          {/* Y-axis max label */}
          <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="11" fill="#999">
            {compactNumber(max)}
          </text>
          {/* Baseline + quartile guides */}
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e5e7eb" />
          {[0.25, 0.5, 0.75].map((q) => (
            <line
              key={q}
              x1={padL}
              y1={padT + chartH - q * chartH}
              x2={W - padR}
              y2={padT + chartH - q * chartH}
              stroke="#f1f4f8"
              strokeDasharray="2 4"
            />
          ))}

          {view.map((w, i) => {
            const v = weekValue(w, metric);
            const isZero = v === 0;
            const h = isZero ? 0 : Math.max(4, (v / max) * chartH);
            const cx = padL + i * slot + slot / 2;
            const x = cx - barWidth / 2;
            const y = padT + chartH - h;
            // Show date label for every Nth bar (right-aligned to end so
            // the most recent week is always visible). Skip values
            // entirely at 6m+ to avoid overlap; tooltip still has them.
            const showDate = (view.length - 1 - i) % labelStride === 0;
            return (
              <g key={w.weekIso}>
                <title>{`${w.label}: ${formatValue(v, metric)}`}</title>
                {isZero ? (
                  <rect x={x} y={H - padB - 4} width={barWidth} height={4} rx={2} fill="#d1d5db" />
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    rx={4}
                    fill={METRIC_FILLS[metric]}
                    opacity={0.92}
                  />
                )}
                {showDate && (
                  <text x={cx} y={dateLabelY} textAnchor="middle" fontSize="11" fill="#999">
                    {w.label}
                  </text>
                )}
                {showValueLabels && (
                  <text
                    x={cx}
                    y={valueLabelY}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isZero ? 400 : 700}
                    fill={isZero ? '#bbb' : 'var(--text)'}
                  >
                    {isZero ? '0' : compactNumber(v)}
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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(v));
}
