import { notFound, redirect } from 'next/navigation';

import {
  cardHeadingStyle,
  cardStyle,
  mutedStyle,
  PageShell,
  tableStyle,
  tdStyle,
  thStyle,
} from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadWorkoutGroupDetail } from '@/lib/data/load-workouts';

export const metadata = { title: 'Workout history — speediance-platform' };

interface PageProps {
  params: { title: string };
  searchParams: { courseId?: string };
}

export default async function WorkoutByTitlePage({ params, searchParams }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const title = decodeURIComponent(params.title);
  const courseId = searchParams.courseId ? Number(searchParams.courseId) : undefined;
  const detail = await loadWorkoutGroupDetail(claims.sub, title, courseId);
  if (!detail || !detail.group) notFound();
  const { group, exerciseAggregates, perExerciseHistory } = detail;

  return (
    <PageShell current="liftlog" userLabel={String(claims.email ?? claims.sub)} title={group.title}>
      <p style={{ margin: '-0.5rem 0 1rem 0', color: '#666' }}>
        <a href="/dashboard" style={{ color: '#0b78d1', textDecoration: 'none' }}>
          ← Back
        </a>
      </p>

      <section style={summaryGridStyle}>
        <Stat label="Sessions" value={String(group.count)} />
        <Stat label="Last done" value={shortDate(group.lastDone)} />
        <Stat label="Avg volume" value={fmtInt(group.avgVolume)} />
        <Stat label="Avg output" value={`${fmtInt(group.avgOutputKj)} kJ`} />
        <Stat label="Avg duration" value={`${Math.round(group.avgDurationMin)}m`} />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>All sessions</h2>
        <p style={mutedStyle}>
          Newest first — click into any session to see the set-by-set detail.
        </p>
        <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Output</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Calories</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {group.workouts.map((w) => (
                <tr key={w.startTime}>
                  <td style={tdStyle}>
                    <a
                      href={`/workouts/${encodeURIComponent(w.startTime)}`}
                      style={{ color: '#0b78d1', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {shortDate(w.startTime)}
                    </a>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.totalCapacity ? fmtInt(w.totalCapacity) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.outputJoules ? `${fmtInt(w.outputJoules / 1000)} kJ` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.calories ? fmtInt(w.calories) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.durationSeconds ? `${Math.round(w.durationSeconds / 60)}m` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Progression per lift</h2>
        <p style={mutedStyle}>
          Max weight per session for each exercise in this workout. Sorted by sets done. Click an
          exercise to see its full set-by-set history.
        </p>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.9rem' }}
        >
          {exerciseAggregates.map((ex) => {
            const history = perExerciseHistory.get(ex.exerciseId) ?? [];
            return (
              <div key={ex.exerciseId}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: '0.4rem',
                  }}
                >
                  <a
                    href={`/exercises/${encodeURIComponent(ex.exerciseId)}`}
                    style={{ color: '#0b78d1', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {ex.name}
                  </a>
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>
                    {ex.muscleGroup ?? '—'} · best {ex.bestWeight ? `${ex.bestWeight}` : '—'} · last{' '}
                    {ex.workingWeight ? `${ex.workingWeight}` : '—'}
                  </span>
                </div>
                {history.length === 0 ? (
                  <p style={{ color: '#888', margin: 0, fontSize: '0.85rem' }}>
                    No weighted sets logged.
                  </p>
                ) : (
                  <MiniChart points={history.map((h) => ({ x: h.startTime, y: h.maxWeight }))} />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}

function MiniChart({ points }: { points: Array<{ x: string; y: number }> }) {
  const filtered = points.filter((p) => p.y > 0);
  if (filtered.length === 0) {
    return <p style={{ color: '#888', margin: 0, fontSize: '0.85rem' }}>No data.</p>;
  }
  const w = Math.max(360, filtered.length * 45);
  const h = 90;
  const pad = { l: 30, r: 8, t: 8, b: 18 };
  const max = Math.max(...filtered.map((p) => p.y), 1);
  const stepX = filtered.length === 1 ? 0 : (w - pad.l - pad.r) / (filtered.length - 1);
  const yOf = (v: number) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const path = filtered
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad.l + i * stepX} ${yOf(p.y)}`)
    .join(' ');
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} role="img">
        <text x={4} y={pad.t + 8} fill="#999" fontSize="9">
          {max.toFixed(0)}
        </text>
        <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke="#e5e7eb" />
        <path d={path} stroke="#0b78d1" strokeWidth={1.5} fill="none" />
        {filtered.map((p, i) => (
          <circle key={i} cx={pad.l + i * stepX} cy={yOf(p.y)} r={2.5} fill="#0b78d1">
            <title>{`${shortDate(p.x)}: ${p.y.toFixed(1)} lb`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={cardStyle}>
      <div
        style={{
          color: '#666',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '0.25rem' }}>{value}</div>
    </div>
  );
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.9rem',
  marginBottom: '1.5rem',
};
