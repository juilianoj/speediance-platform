import { notFound, redirect } from 'next/navigation';

import { NotesSection } from '@/app/(authed)/notes-section';
import {
  cardHeadingStyle,
  cardStyle,
  PageShell,
  tableStyle,
  tdStyle,
  thStyle,
} from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadExercises, type ExerciseSet } from '@/lib/data/load-exercises';
import { loadWorkoutDetail } from '@/lib/data/load-workouts';

export const metadata = { title: 'Workout — speediance-platform' };

interface PageProps {
  params: { startTime: string };
}

export default async function WorkoutDetailPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const startTime = decodeURIComponent(params.startTime);
  const [detail, allExercises] = await Promise.all([
    loadWorkoutDetail(claims.sub, startTime),
    loadExercises(claims.sub),
  ]);
  if (!detail || !detail.workout) notFound();
  const { workout, sets } = detail;

  // Lifetime aggregates per exercise so we can compute "headroom to PR"
  // and the recommended next weight per-lift.
  const aggById = new Map(allExercises.map((e) => [e.exerciseId, e]));

  // Group sets by exerciseId, preserving the order they appeared in the
  // workout (lowest setNum first within each exercise group). Sort the
  // groups by first occurrence so the page matches the order on the
  // Speediance device.
  const grouped = groupSets(sets);

  const isCardio = workout.isCardio || workout.speedianceTrainingType === 'cardio';
  const titleLink = workout.title
    ? `/workouts/by-title/${encodeURIComponent(workout.title)}${
        workout.courseId !== undefined ? `?courseId=${workout.courseId}` : ''
      }`
    : null;

  return (
    <PageShell
      current="liftlog"
      userLabel={String(claims.email ?? claims.sub)}
      title={workout.title ?? 'Workout'}
    >
      <p style={{ margin: '-0.5rem 0 1rem 0', color: '#666' }}>
        <a href="/dashboard" style={{ color: '#0b78d1', textDecoration: 'none' }}>
          ← Back
        </a>
        {titleLink && (
          <>
            {' · '}
            <a href={titleLink} style={{ color: '#0b78d1', textDecoration: 'none' }}>
              View all sessions of this workout →
            </a>
          </>
        )}
      </p>

      <section style={summaryGridStyle}>
        <Stat label="Date" value={fullDate(workout.startTime)} />
        <Stat
          label="Duration"
          value={workout.durationSeconds ? fmtDuration(workout.durationSeconds) : '—'}
        />
        <Stat label="Volume" value={workout.totalCapacity ? fmtInt(workout.totalCapacity) : '—'} />
        <Stat
          label="Output"
          value={workout.outputJoules ? `${fmtInt(workout.outputJoules / 1000)} kJ` : '—'}
        />
        <Stat label="Calories" value={workout.calories ? fmtInt(workout.calories) : '—'} />
      </section>

      {isCardio ? (
        <section style={cardStyle}>
          <h2 style={cardHeadingStyle}>Cardio</h2>
          <dl style={dlStyle}>
            <Row
              label="Distance"
              value={workout.distanceMiles ? `${workout.distanceMiles.toFixed(2)} mi` : '—'}
            />
            <Row
              label="Pace"
              value={
                workout.distanceMiles && workout.durationSeconds
                  ? `${(workout.durationSeconds / 60 / workout.distanceMiles).toFixed(1)} min/mi`
                  : '—'
              }
            />
          </dl>
        </section>
      ) : grouped.length === 0 ? (
        <section style={cardStyle}>
          <p style={{ color: '#888', margin: 0 }}>
            No set detail was synced for this workout. Try forcing a resync from /admin.
          </p>
        </section>
      ) : (
        grouped.map(({ exerciseId, sets: exSets }) => {
          const agg = aggById.get(exerciseId);
          const weightedSets = exSets.filter((s) => (s.weight ?? 0) > 0);
          const hasDetail = weightedSets.length > 0;
          const sessionMax = Math.max(0, ...weightedSets.map((s) => s.weight ?? 0));
          const pr = agg?.bestWeight ?? 0;
          const headroom = hasDetail && pr > 0 ? Math.max(0, pr - sessionMax) : undefined;
          const flagged = weightedSets.some((s) => (s.formFlags?.length ?? 0) > 0);
          const recommendedNext = hasDetail
            ? recommendNext({
                sessionMax,
                allSetsTargetReached: weightedSets.every(
                  (s) => (s.targetReps ?? 0) === 0 || (s.finishedReps ?? 0) >= (s.targetReps ?? 0),
                ),
                flagged,
                isolation: detectIsolation(agg?.name ?? '', agg?.isUnilateral ?? false),
              })
            : null;
          return (
            <section key={exerciseId} style={cardStyle}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <h3 style={{ margin: 0, fontSize: '1rem' }}>
                  <a
                    href={`/exercises/${encodeURIComponent(exerciseId)}`}
                    style={{ color: '#0b78d1', textDecoration: 'none' }}
                  >
                    {agg?.name ?? `Exercise ${exerciseId}`}
                  </a>
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#888' }}>
                  {agg?.muscleGroup ?? '—'}
                  {agg?.isUnilateral && ' · L/R'}
                </span>
              </div>

              {hasDetail ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      marginTop: '0.6rem',
                      fontSize: '0.88rem',
                    }}
                  >
                    <Pill label="Session max" value={`${fmtWt(sessionMax)} lb`} />
                    <Pill label="Lifetime PR" value={pr > 0 ? `${fmtWt(pr)} lb` : '—'} />
                    {headroom !== undefined && (
                      <Pill
                        label="Headroom"
                        value={headroom === 0 ? 'at PR' : `${headroom.toFixed(0)} lb`}
                        accent={headroom === 0 ? '#0d9488' : undefined}
                      />
                    )}
                    {recommendedNext !== null && (
                      <Pill
                        label="Next session"
                        value={`${fmtWt(recommendedNext.weight)} lb`}
                        accent="#0b78d1"
                        sub={recommendedNext.note}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      marginTop: '0.8rem',
                    }}
                  >
                    {weightedSets.map((s) => (
                      <SetChip key={s.setNum} set={s} />
                    ))}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: '0.6rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    alignItems: 'center',
                    fontSize: '0.88rem',
                  }}
                >
                  {pr > 0 && <Pill label="Lifetime PR" value={`${fmtWt(pr)} lb`} />}
                  <span style={{ color: '#888' }}>
                    {exSets.length} {exSets.length === 1 ? 'set' : 'sets'} logged · no per-rep
                    weight detail synced
                  </span>
                </div>
              )}
            </section>
          );
        })
      )}

      <NotesSection targetType="workout" targetId={startTime} label="this session" />
    </PageShell>
  );
}

function groupSets(sets: ExerciseSet[]): Array<{ exerciseId: string; sets: ExerciseSet[] }> {
  // Preserve workout order: first-occurrence index for each exerciseId.
  const order: string[] = [];
  const byEx = new Map<string, ExerciseSet[]>();
  for (const s of sets) {
    if (!byEx.has(s.exerciseId)) {
      byEx.set(s.exerciseId, []);
      order.push(s.exerciseId);
    }
    byEx.get(s.exerciseId)!.push(s);
  }
  return order.map((exerciseId) => ({
    exerciseId,
    sets: byEx.get(exerciseId)!.sort((a, b) => a.setNum - b.setNum),
  }));
}

function recommendNext(opts: {
  sessionMax: number;
  allSetsTargetReached: boolean;
  flagged: boolean;
  isolation: boolean;
}): { weight: number; note: string } | null {
  if (opts.sessionMax <= 0) return null;
  if (opts.flagged) {
    return { weight: opts.sessionMax, note: 'hold — form flag' };
  }
  if (opts.allSetsTargetReached) {
    const bump = opts.isolation ? 2.5 : 5;
    return { weight: opts.sessionMax + bump, note: `+${bump} lb · all reps hit` };
  }
  return { weight: opts.sessionMax, note: 'hold — reps short' };
}

/**
 * Best-effort: count single-arm, isolation, or accessory lifts as "isolation"
 * for the +2.5 progression rule. Compound lifts (squat / bench / row / press
 * / deadlift / pull-up) get the standard +5.
 */
function detectIsolation(name: string, isUnilateral: boolean): boolean {
  if (isUnilateral) return true;
  const lower = name.toLowerCase();
  const COMPOUND = [
    'squat',
    'deadlift',
    'bench press',
    'overhead press',
    'shoulder press',
    'row',
    'pull-up',
    'pullup',
    'chinup',
    'chin-up',
    'thruster',
    'clean',
    'snatch',
  ];
  if (COMPOUND.some((k) => lower.includes(k))) return false;
  return true;
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

function Pill({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: '0.4rem 0.7rem',
        background: '#fafbfc',
        border: '1px solid #e5e7eb',
        borderLeft: accent ? `3px solid ${accent}` : '1px solid #e5e7eb',
        borderRadius: '6px',
      }}
    >
      <div
        style={{
          color: '#888',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 600, marginTop: '0.1rem' }}>{value}</div>
      {sub && <div style={{ color: '#888', fontSize: '0.72rem', marginTop: '0.05rem' }}>{sub}</div>}
    </div>
  );
}

function SetChip({ set }: { set: ExerciseSet }) {
  const display = chipDisplay(set);
  const flagged = (set.formFlags?.length ?? 0) > 0;
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

/**
 * Render text for a Set chip. Three cases:
 *  - Real drop set (per-rep detail, ordered): "211→198×?" — arrow implies
 *    actual heavy→light progression.
 *  - Approximate range from Sam-invite enrichment (no per-rep, but we know
 *    min, max, volume): "~12×198–211" — tilde says "approximate", en-dash
 *    says "varied between, order unknown".
 *  - Standard same-weight set: "35×16".
 */
function chipDisplay(s: ExerciseSet): string {
  const reps = s.finishedReps ?? s.targetReps;
  const isRange =
    s.startWeight !== undefined && s.endWeight !== undefined && s.startWeight !== s.endWeight;
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.4rem 0',
        borderBottom: '1px solid #f1f1f1',
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function fmtWt(n: number | undefined): string {
  if (n === undefined || n === 0) return '—';
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  let h = d.getHours();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dow} ${m} ${day} · ${h}:${min}${ampm}`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.9rem',
  marginBottom: '1.5rem',
};

const dlStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.92rem',
};

// keep tableStyle/tdStyle/thStyle imported so I can use them later;
// silence the unused-warning for now via a void-ref.
void tableStyle;
void tdStyle;
void thStyle;
