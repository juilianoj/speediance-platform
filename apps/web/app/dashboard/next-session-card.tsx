'use client';

import { useRouter } from 'next/navigation';

import type { NextWorkoutPlan, WorkoutOption } from '@/lib/data/load-next-workout';

/**
 * Recommendation panel for the user's next workout. Server-rendered table
 * with a client-side picker (router.push + revalidate) so changing the
 * selection drives a real re-render with fresh recommendations.
 */
export function NextSessionCard({
  options,
  selected,
  plan,
}: {
  options: WorkoutOption[];
  selected: string | null;
  plan: NextWorkoutPlan | null;
}) {
  const router = useRouter();
  const change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) router.push('/dashboard');
    else router.push(`/dashboard?next=${encodeURIComponent(v)}`);
  };

  if (options.length === 0) {
    return (
      <p style={{ color: '#94a3b8', margin: 0 }}>
        No workouts logged yet. After your first sync this will show last weight + suggested next
        weight per lift.
      </p>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label
          style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}
          htmlFor="next-workout-select"
        >
          Show recommendations for
        </label>
        <select
          id="next-workout-select"
          value={selected ?? ''}
          onChange={change}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.95rem',
            background: '#fff',
            minWidth: '260px',
            flex: '1 1 320px',
            maxWidth: '480px',
          }}
        >
          {options.map((o) => (
            <option key={o.title} value={o.title}>
              {o.title} ({o.count}×, last {shortDate(o.lastDone)})
            </option>
          ))}
        </select>
      </div>

      {!plan || plan.lifts.length === 0 ? (
        <p style={{ color: '#94a3b8', marginTop: '1rem' }}>
          No detail data is available for this workout. Either Speediance didn&rsquo;t record set
          info for it, or sync is still backfilling.
        </p>
      ) : (
        <>
          <p style={{ margin: '0.85rem 0 0.75rem 0', color: '#64748b', fontSize: '0.85rem' }}>
            Based on{' '}
            <a
              href={`/workouts/${encodeURIComponent(plan.basedOn.startTime)}`}
              style={{ color: '#0b78d1', textDecoration: 'none' }}
            >
              {shortDate(plan.basedOn.startTime)} session
            </a>{' '}
            ·{' '}
            <a
              href={`/workouts/by-title/${encodeURIComponent(plan.basedOn.title ?? '')}`}
              style={{ color: '#0b78d1', textDecoration: 'none' }}
            >
              full history
            </a>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Exercise</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Last</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Reps</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Best</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Suggest</th>
                  <th style={thStyle}>Why</th>
                </tr>
              </thead>
              <tbody>
                {plan.lifts.map((lift) => {
                  const flagged = (lift.lastFormFlags?.length ?? 0) > 0;
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
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {lift.lastWeight ? `${lift.lastWeight}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
                        {lift.lastReps !== undefined
                          ? `${lift.lastReps}${
                              lift.lastTargetReps ? `/${lift.lastTargetReps}` : ''
                            }`
                          : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
                        {lift.bestWeight ? `${lift.bestWeight}` : '—'}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: lift.recommendedWeight ? '#0b78d1' : '#cbd5e1',
                        }}
                      >
                        {lift.recommendedWeight !== undefined ? `${lift.recommendedWeight}` : '—'}
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
        </>
      )}
    </>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
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
