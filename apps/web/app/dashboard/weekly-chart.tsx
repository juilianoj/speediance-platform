/**
 * Hand-rolled bar chart for weekly volume. Inline SVG → no client JS, no
 * extra dependencies. 12 buckets, fixed pixel widths — replace with a
 * proper library when we need tooltips, axis ticks, etc.
 */
export function WeeklyChart({
  weeks,
}: {
  weeks: Array<{ weekIso: string; label: string; volume: number }>;
}) {
  if (weeks.length === 0) {
    return <p style={{ color: '#888', margin: 0 }}>Not enough data yet.</p>;
  }

  const max = Math.max(...weeks.map((w) => w.volume), 1);
  const barWidth = 38;
  const gap = 12;
  const height = 160;
  const labelGap = 22;
  const totalWidth = weeks.length * (barWidth + gap);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={totalWidth}
        height={height + labelGap}
        viewBox={`0 0 ${totalWidth} ${height + labelGap}`}
        aria-label="Weekly volume bar chart"
        role="img"
      >
        {weeks.map((w, i) => {
          const h = Math.max(2, (w.volume / max) * height);
          const x = i * (barWidth + gap);
          const y = height - h;
          return (
            <g key={w.weekIso}>
              <title>{`${w.label}: ${Math.round(w.volume).toLocaleString()}`}</title>
              <rect x={x} y={y} width={barWidth} height={h} rx={3} fill="#0b78d1" opacity={0.85} />
              <text
                x={x + barWidth / 2}
                y={height + labelGap - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#666"
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
