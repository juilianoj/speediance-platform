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
import { NotesSection } from '@/app/(authed)/notes-section';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadExerciseHistory, type ExerciseSet } from '@/lib/data/load-exercises';

export const metadata = { title: 'Exercise' };

interface PageProps {
  params: { id: string };
}

export default async function ExerciseDetailPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const exerciseId = decodeURIComponent(params.id);

  const { exercise, sets, workoutTitleByStart } = await loadExerciseHistory(claims.sub, exerciseId);
  if (!exercise && sets.length === 0) notFound();

  // Sets split into "weighted" (real per-rep detail) and "placeholders"
  // (curriculum-fallback sessions where Speediance's detail endpoint didn't
  // return per-rep data — we wrote a single sentinel set so the user still
  // sees they did the exercise on that day).
  const weightedSets = sets.filter((s) => (s.weight ?? 0) > 0);
  const placeholderCount = sets.length - weightedSets.length;

  // Three groupings:
  //   allSessions: every workout that contained the exercise — drives the
  //     "Recent sessions" card so the user still sees "you did this on Mar 2".
  //   weightedSessions: workouts with real weight data — drives the chart
  //     and "All sets" table, where empty placeholder rows would just be
  //     noise (long stretches of "— — —" otherwise).
  const allSessions = groupByWorkout(sets);
  const weightedSessions = groupByWorkout(weightedSets);
  const chartPoints = weightedSessions.map((s) => ({
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
      <p style={{ margin: '-0.5rem 0 1.5rem 0', color: 'var(--text-muted)' }}>
        <a href="/lift-log" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ← Back to lift log
        </a>
      </p>

      <section style={summaryGridStyle}>
        <Stat label="Sessions" value={String(allSessions.length)} />
        <Stat label="Best weight" value={fmtWt(exercise?.bestWeight)} />
        <Stat label="Working weight" value={fmtWt(exercise?.workingWeight)} />
        <Stat label="Muscle group" value={exercise?.muscleGroup ?? '—'} />
        <Stat label="Total sets" value={String(weightedSets.length)} />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Max weight per session</h2>
        <p style={mutedStyle}>Heaviest single set, oldest → newest.</p>
        {chartPoints.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1rem 0 0' }}>
            No per-rep weight data captured for this exercise yet — Speediance only ships per-rep
            detail for some workout types.
          </p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <MaxWeightChart points={[...chartPoints].reverse()} />
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Recent sessions</h2>
        <p style={mutedStyle}>Sets per session, drop-sets render as start → end.</p>
        {allSessions.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1rem 0 0' }}>No sets logged yet.</p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {allSessions.slice(0, 8).map((s) => {
              const weighted = s.sets.filter((x) => (x.weight ?? 0) > 0);
              const hasDetail = weighted.length > 0;
              return (
                <div
                  key={s.startTime}
                  style={{
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--border-faint)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <a
                        href={`/workouts/${encodeURIComponent(s.startTime)}`}
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: 'var(--text)',
                          textDecoration: 'none',
                        }}
                      >
                        {shortDate(s.startTime)}
                      </a>
                      {workoutTitleByStart.get(s.startTime) && (
                        <div
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.78rem',
                            marginTop: '0.15rem',
                          }}
                        >
                          {workoutTitleByStart.get(s.startTime)}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                      {s.sets.length} set{s.sets.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {hasDetail ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                        marginTop: '0.4rem',
                      }}
                    >
                      {weighted.map((set) => (
                        <SetChip key={set.setNum} set={set} />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: '0.4rem',
                        color: 'var(--text-faint)',
                        fontSize: '0.82rem',
                        fontStyle: 'italic',
                      }}
                    >
                      No per-rep detail captured for this session.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>All sets</h2>
        <p style={mutedStyle}>
          Every set with logged weight + reps.
          {placeholderCount > 0 && (
            <>
              {' '}
              <span style={{ color: 'var(--text-faint)' }}>
                ({placeholderCount} additional session{placeholderCount === 1 ? '' : 's'} above had
                no per-rep detail captured — see Recent sessions.)
              </span>
            </>
          )}
        </p>
        <table style={{ ...tableStyle, marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Workout</th>
              <th style={thStyle}>Set #</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Reps</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
              <th style={thStyle}>Form</th>
            </tr>
          </thead>
          <tbody>
            {weightedSets.map((s) => {
              const wTitle = workoutTitleByStart.get(s.startTime);
              return (
                <tr key={`${s.startTime}-${s.setNum}`}>
                  <td style={tdStyle}>
                    <a
                      href={`/workouts/${encodeURIComponent(s.startTime)}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {shortDate(s.startTime)}
                    </a>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {wTitle ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.setNum}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatWeight(s)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{s.finishedReps ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-muted)' }}>
                    {s.volume !== undefined ? Math.round(s.volume).toLocaleString() : '—'}
                  </td>
                  <td style={tdStyle}>
                    {s.formFlags && s.formFlags.length > 0 ? (
                      <span style={{ color: 'var(--danger)' }}>⚠ {s.formFlags.join(',')}</span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <NotesSection targetType="exercise" targetId={exerciseId} label="this exercise" />
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
          color: 'var(--text-muted)',
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
  const display = chipDisplay(set);
  const flagged = set.formFlags && set.formFlags.length > 0;
  return (
    <span
      style={{
        padding: '0.3rem 0.55rem',
        fontSize: '0.85rem',
        background: flagged ? 'var(--danger-bg)' : 'var(--bg-chip)',
        color: flagged ? 'var(--danger)' : 'var(--accent-strong)',
        border: '1px solid',
        borderColor: flagged ? 'var(--danger-border)' : 'var(--border)',
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
  if (points.length === 0) return <p style={{ color: 'var(--text-faint)' }}>No data.</p>;
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

/**
 * Render text for a Set chip. Three cases:
 *  - Real drop set (per-rep detail available, ordered): "211→198×?" — arrow
 *    implies actual heavy→light progression.
 *  - Approximate range from a Sam-invite enrichment (no per-rep, but we know
 *    min, max, volume): "~12×198–211" — tilde says "approximate", en-dash
 *    says "varied between, order unknown".
 *  - Standard same-weight set: "35×16".
 */
function chipDisplay(s: ExerciseSet): string {
  const reps = s.finishedReps ?? s.targetReps;
  const isRange =
    s.startWeight !== undefined && s.endWeight !== undefined && s.startWeight !== s.endWeight;
  // Enriched-from-stats range: we have a volume + a min/max but no rep count.
  if (isRange && reps === undefined && s.volume !== undefined) {
    const avg = (s.startWeight! + s.endWeight!) / 2;
    const approxReps = Math.max(1, Math.round(s.volume / avg));
    const lo = Math.min(s.startWeight!, s.endWeight!);
    const hi = Math.max(s.startWeight!, s.endWeight!);
    return `~${approxReps}×${lo}–${hi}`;
  }
  if (isRange) return `${s.startWeight}→${s.endWeight}×${reps ?? '?'}`;
  return `${fmtWt(s.weight)}×${reps ?? '?'}`;
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
