import type { PlannedLift } from '@/lib/data/load-next-workout';

/**
 * Rendered table of planned lifts for a workout — shared between the dashboard
 * next-session card and the scheduled-day drill-in page.
 *
 * Column model (post-program-prescription refresh):
 *   - Exercise            (name + muscle/last-date)
 *   - Plan                Speediance's prescribed weight × reps for the workout
 *   - Last                user's lifetime-latest set (any workout)
 *   - 1RM                 user's best 1RM from Speediance (when known)
 *   - Suggest             our progression weight (lifetime-derived when we
 *                         have a log, else echoes the plan)
 *   - Why                 short rationale string
 *
 * Pure server component — no client interaction lives here. The picker that
 * drives `lifts` is the parent's responsibility.
 */
export function NextSessionTable({ lifts }: { lifts: PlannedLift[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Exercise</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Plan</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Last</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>1RM</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Suggest</th>
            <th style={thStyle}>Why</th>
          </tr>
        </thead>
        <tbody>
          {lifts.map((lift) => {
            const flagged = (lift.lastFormFlags?.length ?? 0) > 0;
            const planSummary = formatPlan(lift);
            const planReps = lift.plannedReps?.join('-');
            const lastBlurb = lift.lastReps !== undefined ? `${lift.lastReps} reps` : null;
            return (
              <tr key={lift.exerciseId} style={trStyle}>
                <td style={tdStyle}>
                  <a
                    href={`/exercises/${encodeURIComponent(lift.exerciseId)}`}
                    style={{ color: '#0b78d1', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {lift.name}
                  </a>
                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    {lift.muscleGroup ?? '—'}
                    {lift.isUnilateral && ' · L/R'}
                    {lift.lastSessionDate &&
                      ` · last log ${shortDate(lift.lastSessionDate.slice(0, 10))}`}
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {planSummary ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{planSummary}</div>
                      {planReps && (
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{planReps} reps</div>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {lift.lastWeight ? (
                    <>
                      <div>{lift.lastWeight}</div>
                      {lastBlurb && (
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{lastBlurb}</div>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
                  {lift.bestOneRepMax ?? lift.bestWeight ?? '—'}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: lift.recommendedWeight ? '#0b78d1' : '#cbd5e1',
                  }}
                >
                  {lift.recommendedWeight !== undefined ? lift.recommendedWeight : '—'}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color: flagged ? '#dc2626' : '#64748b',
                    fontSize: '0.82rem',
                  }}
                >
                  {lift.recommendNote ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatPlan(lift: PlannedLift): string | null {
  const weights = lift.plannedWeights ?? [];
  if (weights.length === 0) {
    return lift.speedianceRecommendedWeight ? `${lift.speedianceRecommendedWeight}` : null;
  }
  // If all the same, render once; otherwise show range.
  const unique = Array.from(new Set(weights));
  if (unique.length === 1) {
    return `${unique[0]} × ${weights.length}`;
  }
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return `${min}-${max} × ${weights.length}`;
}

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${m} ${d.getUTCDate()}`;
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const trStyle: React.CSSProperties = { borderTop: '1px solid #f1f5f9' };

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: '#64748b',
  fontWeight: 600,
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
};
