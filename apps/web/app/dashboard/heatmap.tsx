/**
 * GitHub-style year heatmap. 52 weeks × 7 days. Each cell colored by the
 * intensity of that day's workout. Empty days are white. Hover for date +
 * details. Click navigates to the workout (if any).
 *
 * Server-rendered SVG — no client JS. The intensity scale uses fixed
 * quintile thresholds against the user's own data range so the gradient
 * is always meaningful regardless of absolute volume.
 */
import type { DashboardWorkout } from './load-dashboard';

type DayCell = {
  date: string; // YYYY-MM-DD (UTC)
  startTime?: string;
  title?: string;
  output?: number;
  volume?: number;
  scheduled?: boolean;
  isCardio?: boolean;
};

const CELL = 12;
const GAP = 2.5;
const WEEKS = 53; // up to 53 covers any one-year window
const DOW = 7;
const PAD_L = 24;
const PAD_T = 14;
const WIDTH = PAD_L + WEEKS * (CELL + GAP);
const HEIGHT = PAD_T + DOW * (CELL + GAP) + 12;

const COLORS = ['#eef5fc', '#bcdcf3', '#7fbde8', '#3d97d8', '#1166a9']; // light → dark blue
const SCHEDULED_COLOR = '#fef3c7'; // amber tint for upcoming days
const TODAY_RING = '#0b78d1';

export function YearHeatmap({
  workouts,
  scheduledDates,
}: {
  workouts: DashboardWorkout[];
  scheduledDates?: Set<string>;
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Build day cells for the past 365 days, aligned to weeks (Sunday=0).
  const cells: DayCell[][] = [];
  const startSun = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  startSun.setUTCDate(startSun.getUTCDate() - 52 * 7 - startSun.getUTCDay());
  const byDate = new Map<string, DashboardWorkout>();
  for (const w of workouts) {
    const d = new Date(w.startTime).toISOString().slice(0, 10);
    const existing = byDate.get(d);
    // Prefer the strength workout for the day if there are multiple sessions.
    if (!existing || (existing.outputJoules ?? 0) < (w.outputJoules ?? 0)) {
      byDate.set(d, w);
    }
  }

  for (let week = 0; week < WEEKS; week++) {
    const col: DayCell[] = [];
    for (let day = 0; day < DOW; day++) {
      const d = new Date(startSun);
      d.setUTCDate(d.getUTCDate() + week * 7 + day);
      const iso = d.toISOString().slice(0, 10);
      const w = byDate.get(iso);
      const scheduled = scheduledDates?.has(iso) ?? false;
      col.push({
        date: iso,
        startTime: w?.startTime,
        title: w?.title,
        output: w?.outputJoules,
        volume: w?.totalCapacity,
        isCardio: w?.isCardio || w?.speedianceTrainingType === 'cardio',
        scheduled: scheduled && !w,
      });
    }
    cells.push(col);
  }

  // Build the intensity scale from the user's actual output range — 80th
  // percentile is "darkest" so a single huge outlier doesn't wash out the
  // gradient.
  const outputs = workouts
    .map((w) => w.outputJoules ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const p = (q: number) =>
    outputs.length === 0
      ? 0
      : (outputs[Math.min(outputs.length - 1, Math.floor(outputs.length * q))] ?? 0);
  const thresholds = [p(0.2), p(0.45), p(0.7), p(0.92)];

  const colorFor = (cell: DayCell): string => {
    if (cell.scheduled) return SCHEDULED_COLOR;
    if (cell.output === undefined || cell.output <= 0) return '#ffffff';
    let bucket = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (cell.output >= thresholds[i]!) bucket = i + 1;
    }
    return COLORS[bucket] ?? COLORS[0]!;
  };

  // Month labels along the top — render whenever the first cell of a column
  // is the 1st through 7th of a new month.
  const monthLabels: Array<{ x: number; text: string }> = [];
  let lastMonth = -1;
  for (let week = 0; week < WEEKS; week++) {
    const firstCell = cells[week]?.[0];
    if (!firstCell) continue;
    const d = new Date(firstCell.date + 'T00:00:00Z');
    if (d.getUTCMonth() !== lastMonth && d.getUTCDate() <= 7) {
      const m = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][d.getUTCMonth()]!;
      monthLabels.push({ x: PAD_L + week * (CELL + GAP), text: m });
      lastMonth = d.getUTCMonth();
    }
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Workout heatmap, past year"
          style={{ display: 'block' }}
        >
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.x}
              y={PAD_T - 3}
              fontSize="10"
              fill="#94a3b8"
              fontFamily="system-ui, sans-serif"
            >
              {m.text}
            </text>
          ))}

          {/* Day labels (Mon / Wed / Fri) */}
          {[
            [1, 'Mon'],
            [3, 'Wed'],
            [5, 'Fri'],
          ].map(([dow, label]) => (
            <text
              key={label}
              x={4}
              y={PAD_T + Number(dow) * (CELL + GAP) + CELL - 2}
              fontSize="9"
              fill="#94a3b8"
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {cells.map((col, w) =>
            col.map((cell, d) => {
              const x = PAD_L + w * (CELL + GAP);
              const y = PAD_T + d * (CELL + GAP);
              const inRange = cell.date <= todayIso;
              const isToday = cell.date === todayIso;
              const fill = inRange ? colorFor(cell) : cell.scheduled ? SCHEDULED_COLOR : '#ffffff';
              const cellTitle = makeTooltip(cell);
              const rect = (
                <rect
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={fill}
                  stroke={isToday ? TODAY_RING : '#e5e7eb'}
                  strokeWidth={isToday ? 1.4 : 0.5}
                  style={cell.startTime || cell.scheduled ? { cursor: 'pointer' } : undefined}
                >
                  <title>{cellTitle}</title>
                </rect>
              );
              if (cell.startTime) {
                return (
                  <a key={`${w}-${d}`} href={`/workouts/${encodeURIComponent(cell.startTime)}`}>
                    {rect}
                  </a>
                );
              }
              if (cell.scheduled) {
                return (
                  <a key={`${w}-${d}`} href={`/scheduled/${cell.date}`}>
                    {rect}
                  </a>
                );
              }
              return <g key={`${w}-${d}`}>{rect}</g>;
            }),
          )}
        </svg>
      </div>

      <Legend />
    </div>
  );
}

function makeTooltip(c: DayCell): string {
  if (c.scheduled) return `${c.date}: scheduled`;
  if (!c.startTime) return c.date;
  const parts: string[] = [c.date];
  if (c.title) parts.push(c.title);
  if (c.output !== undefined) parts.push(`${(c.output / 1000).toFixed(0)} kJ`);
  if (c.volume !== undefined && c.volume > 0) parts.push(`${c.volume.toLocaleString()} vol`);
  return parts.join(' — ');
}

function Legend() {
  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        marginTop: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.78rem',
        color: '#64748b',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        Less
        {COLORS.map((c) => (
          <span
            key={c}
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: c,
              border: '1px solid #e5e7eb',
              borderRadius: 2,
            }}
          />
        ))}
        More
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: SCHEDULED_COLOR,
            border: '1px solid #e5e7eb',
            borderRadius: 2,
          }}
        />
        Scheduled
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: '#fff',
            border: `1.4px solid ${TODAY_RING}`,
            borderRadius: 2,
          }}
        />
        Today
      </span>
    </div>
  );
}
