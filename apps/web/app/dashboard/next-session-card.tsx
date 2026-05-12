'use client';

import { useRouter } from 'next/navigation';

import type { NextWorkoutPlan, WorkoutOption } from '@/lib/data/load-next-workout';

import { NextSessionTable } from './next-session-table';

/**
 * Recommendation panel for the user's next workout. Server-rendered table
 * with a client-side picker (router.push) so changing the selection drives
 * a real re-render with fresh recommendations.
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

  const source = plan?.source;
  const lastCompleted = plan?.lastCompleted ?? null;

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
            minWidth: '320px',
            flex: '1 1 360px',
            maxWidth: '560px',
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!plan || plan.lifts.length === 0 ? (
        <p style={{ color: '#94a3b8', marginTop: '1rem' }}>
          No exercise data is available for this workout yet — try again after the next sync.
        </p>
      ) : (
        <>
          <p style={{ margin: '0.85rem 0 0.75rem 0', color: '#64748b', fontSize: '0.85rem' }}>
            {source?.kind === 'scheduled' ? (
              <>
                Up next: <strong style={{ color: '#0f172a' }}>{plan.title}</strong> · scheduled{' '}
                {shortDate(source.date)}.
              </>
            ) : (
              <>
                Most recent: <strong style={{ color: '#0f172a' }}>{plan.title}</strong> ·{' '}
                {shortDate(source?.date ?? '')}.
              </>
            )}
            {lastCompleted && source?.kind === 'scheduled' && (
              <>
                {' '}
                Last completed{' '}
                <a
                  href={`/workouts/${encodeURIComponent(lastCompleted.startTime)}`}
                  style={{ color: '#0b78d1', textDecoration: 'none' }}
                >
                  {shortDate(lastCompleted.startTime)}
                </a>
                .
              </>
            )}{' '}
            <span style={{ color: '#94a3b8' }}>
              &quot;Plan&quot; is Speediance&apos;s prescription for this workout. &quot;Last&quot;
              + &quot;Suggest&quot; come from your lifetime history when you&apos;ve logged the lift
              before.
            </span>
          </p>
          <NextSessionTable lifts={plan.lifts} />
        </>
      )}
    </>
  );
}

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${m} ${d.getUTCDate()}`;
}
