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
import { loadExerciseHistory, type ExerciseSet } from '@/lib/data/load-exercises';

export const metadata = { title: 'Exercise — speediance-platform' };

interface PageProps {
  params: { id: string };
}

export default async function ExerciseDetailPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const exerciseId = decodeURIComponent(params.id);

  const { exercise, sets } = await loadExerciseHistory(claims.sub, exerciseId);
  if (!exercise && sets.length === 0) notFound();

  // Group sets by workout (startTime).
  const sessions = groupByWorkout(sets);
  const chartPoints = sessions.map((s) => ({
    startTime: s.startTime,
    maxWeight: Math.max(0, ...s.sets.map((x) => x.weight ?? 0)),
    label: shortDate(s.startTime),
  }));

  return (
    <PageShell
      current="liftlog"
      userLabel={String(claims.email ?? claims.sub)}
      title={exercise?.name ?? 'Exercise'}
    >
      <p style={{ margin: '-0.5rem 0 1.5rem 0', color: '#666' }}>
        <a href="/lift-log" style={{ color: '#0b78d1', textDecoration: 'none' }}>
          ← Back to lift log
        </a>
      </p>

      <section style={summaryGridStyle}>
        <Stat label="Sessions" value={String(sessions.length)} />
        <Stat label="Best weight" value={fmtWt(exercise?.bestWeight)} />
        <Stat label="Working weight" value={fmtWt(exercise?.workingWeight)} />
        <Stat label="Muscle group" value={exercise?.muscleGroup ?? '—'} />
        <Stat label="Total sets" value={String(exercise?.totalSets ?? sets.length)} />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Max weight per session</h2>
        <p style={mutedStyle}>Heaviest single set, oldest → newest.</p>
        <div style={{ marginTop: '1rem' }}>
          <MaxWeightChart points={[...chartPoints].reverse()} />
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Recent sessions</h2>
        <p style={mutedStyle}>Sets per session, drop-sets render as start → end.</p>
        {sessions.length === 0 ? (
          <p style={{ color: '#888', margin: '1rem 0 0' }}>No sets logged yet.</p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {sessions.slice(0, 8).map((s) => (
              <div
                key={s.startTime}
                style={{
                  marginBottom: '1rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #f1f1f1',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <strong style={{ fontSize: '0.95rem' }}>{shortDate(s.startTime)}</strong>
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>
                    {s.sets.length} set{s.sets.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}
                >
                  {s.sets.map((set) => (
                    <SetChip key={set.setNum} set={set} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>All sets</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Set #</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Reps</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
              <th style={thStyle}>Form</th>
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => (
              <tr key={`${s.startTime}-${s.setNum}`}>
                <td style={tdStyle}>{shortDate(s.startTime)}</td>
                <td style={{ ...tdStyle, color: '#666' }}>{s.setNum}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatWeight(s)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{s.finishedReps ?? '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>
                  {s.volume !== undefined ? Math.round(s.volume).toLocaleString() : '—'}
                </td>
                <td style={tdStyle}>
                  {s.formFlags && s.formFlags.length > 0 ? (
                    <span style={{ color: '#dc2626' }}>⚠ {s.formFlags.join(',')}</span>
                  ) : (
                    <span style={{ color: '#0d9488' }}>✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}

function groupByWorkout(sets: ExerciseSet[]): Array<{ startTime: string; sets: ExerciseSet[] }> {
  const map = new Map<string, ExerciseSet[]>();
  for (const s of sets) {
    if (!map.has(s.startTime)) map.set(s.startTime, []);
    map.get(s.startTime)!.push(s);
  }
  return [...map.entries()]
    .map(([startTime, ss]) => ({ startTime, sets: ss.sort((a, b) => a.setNum - b.setNum) }))
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
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
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.25rem' }}>{value}</div>
    </div>
  );
}

function SetChip({ set }: { set: ExerciseSet }) {
  const reps = set.finishedReps ?? set.targetReps ?? '?';
  const isDrop =
    set.startWeight !== undefined &&
    set.endWeight !== undefined &&
    set.startWeight !== set.endWeight;
  const display = isDrop
    ? `${set.startWeight}→${set.endWeight}×${reps}`
    : `${formatWeight(set)}×${reps}`;
  const flagged = set.formFlags && set.formFlags.length > 0;
  return (
    <span
      style={{
        padding: '0.3rem 0.55rem',
        fontSize: '0.85rem',
        background: flagged ? '#fee2e2' : '#eef5fc',
        color: flagged ? '#b91c1c' : '#0b5fa8',
        border: '1px solid',
        borderColor: flagged ? '#fecaca' : '#cce2f4',
        borderRadius: '999px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {display}
      {flagged && <span style={{ marginLeft: '0.25rem' }}>⚠</span>}
    </span>
  );
}

function MaxWeightChart({ points }: { points: Array<{ label: string; maxWeight: number }> }) {
  if (points.length === 0) return <p style={{ color: '#888' }}>No data.</p>;
  const w = Math.max(280, points.length * 50);
  const h = 180;
  const pad = { l: 30, r: 10, t: 10, b: 24 };
  const max = Math.max(...points.map((p) => p.maxWeight), 1);
  const stepX = (w - pad.l - pad.r) / Math.max(1, points.length - 1);
  const yOf = (v: number) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad.l + i * stepX} ${yOf(p.maxWeight)}`)
    .join(' ');
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} role="img" aria-label="Max weight per session">
        <text x={pad.l} y={pad.t + 8} fill="#999" fontSize="10">
          {max.toFixed(0)}
        </text>
        <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke="#e5e7eb" />
        <path d={path} stroke="#0b78d1" strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={pad.l + i * stepX} cy={yOf(p.maxWeight)} r={3} fill="#0b78d1" />
            <text x={pad.l + i * stepX} y={h - 6} textAnchor="middle" fontSize="9" fill="#999">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function fmtWt(n: number | undefined): string {
  if (n === undefined) return '—';
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function formatWeight(s: ExerciseSet): string {
  if (s.startWeight !== undefined && s.endWeight !== undefined && s.startWeight !== s.endWeight) {
    return `${s.startWeight}→${s.endWeight}`;
  }
  return fmtWt(s.weight);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${day}`;
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '0.9rem',
  marginBottom: '1.25rem',
};
