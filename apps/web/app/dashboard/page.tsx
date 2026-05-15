import { redirect } from 'next/navigation';

import { PageShell } from '@/app/(authed)/page-shell';
import { loadProfile } from '@/app/profile/load-profile';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadNextWorkoutPlan } from '@/lib/data/load-next-workout';
import { loadRecoveryWarnings, type RecoveryWarning } from '@/lib/data/load-recovery-warnings';
import { loadScheduledDates } from '@/lib/data/load-scheduled';
import { loadAllWorkouts } from '@/lib/data/load-workouts';

import { YearHeatmap } from './heatmap';
import { loadDashboard, type DashboardData, type DashboardWorkout } from './load-dashboard';
import { MuscleGroupChart } from './muscle-group-chart';
import { NextSessionCard } from './next-session-card';
import { RecoveryBanner } from './recovery-banner';
import { SyncBanner } from './sync-banner';
import { WeeklyChart } from './weekly-chart';

export const metadata = {
  title: 'Dashboard',
};

interface PageProps {
  searchParams: { next?: string };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const display = claims.email ?? claims['cognito:username'] ?? claims.sub;
  const preferredTitle = searchParams.next ? decodeURIComponent(searchParams.next) : undefined;
  // allSettled so a stuck Speediance calendar call doesn't tank the page —
  // the heatmap renders fine without the scheduled overlay.
  const settled = await Promise.allSettled([
    loadDashboard(claims.sub),
    loadNextWorkoutPlan(claims.sub, preferredTitle),
    loadAllWorkouts(claims.sub),
    loadScheduledDates(claims.sub),
    loadProfile(claims.sub),
    loadRecoveryWarnings(claims.sub),
  ]);
  const data = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const next = settled[1].status === 'fulfilled' ? settled[1].value : null;
  const allWorkouts = settled[2].status === 'fulfilled' ? settled[2].value : [];
  const scheduledDates = settled[3].status === 'fulfilled' ? settled[3].value : new Set<string>();
  const profile = settled[4].status === 'fulfilled' ? settled[4].value : null;
  const recoveryWarnings: RecoveryWarning[] =
    settled[5].status === 'fulfilled' ? settled[5].value : [];

  return (
    <PageShell current="dashboard" userLabel={String(display)}>
      {data?.hasCreds && <SyncBanner lastSyncedAt={profile?.lastSyncedAt} />}
      {!data || !data.hasCreds ? (
        <SetupCallout hasProfile={data?.hasProfile ?? false} />
      ) : (
        <>
          <RecoveryBanner warnings={recoveryWarnings} />
          <DashboardBody
            data={data}
            nextPlan={next?.plan ?? null}
            nextOptions={next?.options ?? []}
            preferredTitle={preferredTitle}
            allWorkouts={allWorkouts}
            scheduledDates={scheduledDates}
          />
        </>
      )}
    </PageShell>
  );
}

function SetupCallout({ hasProfile }: { hasProfile: boolean }) {
  return (
    <section
      style={{
        padding: '1.5rem',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        background: 'var(--accent-soft)',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
        {hasProfile ? 'Add your Speediance credentials' : 'Finish setting up your profile'}
      </h2>
      <p style={{ margin: '0 0 1rem 0', color: 'var(--text)' }}>
        Head to{' '}
        <a href="/profile" style={linkStyle}>
          Profile
        </a>{' '}
        to enter your Speediance email + password. Once saved, the sync worker pulls your training
        history and your dashboard fills in.
      </p>
      <a
        href="/profile"
        style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none' }}
      >
        Open profile →
      </a>
    </section>
  );
}

function DashboardBody({
  data,
  nextPlan,
  nextOptions,
  preferredTitle,
  allWorkouts,
  scheduledDates,
}: {
  data: DashboardData;
  nextPlan: NonNullable<Awaited<ReturnType<typeof loadNextWorkoutPlan>>>['plan'];
  nextOptions: NonNullable<Awaited<ReturnType<typeof loadNextWorkoutPlan>>>['options'];
  preferredTitle?: string;
  allWorkouts: DashboardWorkout[];
  scheduledDates: Set<string>;
}) {
  const { thisWeek, weeks, workouts, kpis30d, muscleGroupSets } = data;

  return (
    <>
      {/* KPI strip across the top — your at-a-glance pulse. */}
      <section style={kpiGridStyle}>
        <KpiCard
          accent="#0b78d1"
          label="Strength · 30d"
          value={String(kpis30d.strengthSessions)}
          suffix="sessions"
          sub={`${kpis30d.cardioSessions} cardio`}
        />
        <KpiCard
          accent="#2563eb"
          label="Volume · 30d"
          value={fmtInt(kpis30d.totalVolume)}
          suffix="lbs"
          sub={`${fmtInt(thisWeek.volume)} this week`}
        />
        <KpiCard
          accent="#7c3aed"
          label="Output · 30d"
          value={fmtInt(kpis30d.totalOutputKj)}
          suffix="kJ"
          sub={`${kpis30d.avgOutputPerMin.toFixed(1)} kJ/min avg`}
        />
        <KpiCard
          accent="#dc2626"
          label="Calories · 30d"
          value={fmtInt(kpis30d.totalCalories)}
          suffix="kcal"
          sub={`${fmtInt(thisWeek.calories)} this week`}
        />
        <KpiCard
          accent="#0d9488"
          label="Avg duration"
          value={`${Math.round(kpis30d.avgStrengthDurationMin)}m`}
          suffix="per strength"
          sub={
            kpis30d.totalDistanceMiles > 0
              ? `${kpis30d.totalDistanceMiles.toFixed(1)} mi cardio`
              : '—'
          }
        />
      </section>

      {/* Year heatmap — your activity at a glance. */}
      <section style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardHeadingStyle}>Activity heatmap</h2>
          <p style={mutedStyle}>
            Past year of workouts. Color intensity = workout output. Amber = scheduled. Click a day
            to drill in.
          </p>
        </div>
        <YearHeatmap workouts={allWorkouts} scheduledDates={scheduledDates} />
      </section>

      {/* Weekly trend — second-level detail underneath the heatmap. */}
      <section style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardHeadingStyle}>Weekly trend</h2>
          <p style={mutedStyle}>Pick a metric and time range.</p>
        </div>
        <WeeklyChart weeks={weeks} />
      </section>

      {/* Next session — actionable recommendations the user opens the app for. */}
      <section style={{ ...cardStyle, borderTop: '3px solid var(--accent)' }}>
        <div style={cardHeaderStyle}>
          <h2 style={cardHeadingStyle}>Next session</h2>
          <p style={mutedStyle}>
            Defaults to your next scheduled workout from the Speediance calendar. The suggested
            weight per lift comes from the most recent set you logged for that exercise — across any
            workout.
          </p>
        </div>
        <NextSessionCard
          options={nextOptions}
          selected={preferredTitle ?? nextOptions[0]?.value ?? null}
          plan={nextPlan}
        />
      </section>

      <section style={twoColStyle}>
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={cardHeadingStyle}>Muscle group focus</h2>
            <p style={mutedStyle}>Sets logged in the last 30 days.</p>
          </div>
          <MuscleGroupChart sets={muscleGroupSets} />
        </div>

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={cardHeadingStyle}>This week</h2>
            <p style={mutedStyle}>{thisWeek.label}.</p>
          </div>
          <dl style={dlStyle}>
            <Row label="Workouts" value={String(thisWeek.workouts)} />
            <Row label="Volume" value={fmtInt(thisWeek.volume)} />
            <Row label="Output" value={`${fmtInt(thisWeek.outputKj)} kJ`} />
            <Row label="Calories" value={fmtInt(thisWeek.calories)} />
            <Row
              label="Duration"
              value={
                thisWeek.durationMinutes > 0 ? `${Math.round(thisWeek.durationMinutes)}m` : '—'
              }
            />
          </dl>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardHeadingStyle}>Recent sessions</h2>
          <p style={mutedStyle}>Twelve most recent. Click any row for set-by-set detail.</p>
        </div>
        {workouts.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: 0 }}>
            No workouts pulled yet. The next sync runs every morning, or after you save your
            profile.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Workout</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Output</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Calories</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {workouts.map((w) => (
                  <WorkoutRow key={w.startTime} w={w} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function WorkoutRow({ w }: { w: DashboardWorkout }) {
  const isCardio = w.isCardio ?? w.speedianceTrainingType === 'cardio';
  const detailHref = `/workouts/${encodeURIComponent(w.startTime)}`;
  return (
    <tr style={{ ...trStyle, cursor: 'pointer' }}>
      <td style={tdStyle}>
        <a href={detailHref} style={rowLinkStyle}>
          <div style={{ fontWeight: 500 }}>{formatDate(w.startTime)}</div>
          <div style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>
            {formatTime(w.startTime)}
          </div>
        </a>
      </td>
      <td style={tdStyle}>
        <a href={detailHref} style={rowLinkStyle}>
          <div>{w.title ?? (isCardio ? 'Cardio' : 'Untitled workout')}</div>
          <div style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>
            {isCardio
              ? `${w.distanceMiles?.toFixed(2) ?? '—'} mi`
              : (w.courseCategoryName ?? w.speedianceTrainingType ?? '—')}
          </div>
        </a>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {w.totalCapacity ? fmtInt(w.totalCapacity) : '—'}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {w.outputJoules ? `${fmtInt(w.outputJoules / 1000)} kJ` : '—'}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>{w.calories ? fmtInt(w.calories) : '—'}</td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {w.durationSeconds ? formatDuration(w.durationSeconds) : '—'}
      </td>
    </tr>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  suffix: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: '1.1rem 1.2rem',
        border: '1px solid var(--border)',
        borderTop: `3px solid ${accent}`,
        borderRadius: '12px',
        background: 'var(--bg-card)',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      <div style={kpiLabelStyle}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.3rem' }}>
        <span style={{ fontSize: '1.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{suffix}</span>
      </div>
      {sub && (
        <div style={{ color: 'var(--text-faint)', fontSize: '0.78rem', marginTop: '0.25rem' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.5rem 0',
        borderBottom: '1px solid var(--border-faint)',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

const rowLinkStyle: React.CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
  display: 'block',
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${dow} ${m} ${day}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}${ampm}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

// ── Styles ──────────────────────────────────────────────────────────────

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontSize: '0.95rem',
  textDecoration: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
};

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
  gap: '0.9rem',
  marginBottom: '1.5rem',
};

const kpiLabelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  padding: '1.4rem 1.5rem',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--bg-card)',
  marginBottom: '1.25rem',
  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
};

const cardHeaderStyle: React.CSSProperties = {
  marginBottom: '1rem',
};

const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const mutedStyle: React.CSSProperties = {
  margin: '0.2rem 0 0 0',
  color: 'var(--text-faint)',
  fontSize: '0.85rem',
};

const twoColStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '1.25rem',
  marginBottom: 0,
};

const dlStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.94rem',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const trStyle: React.CSSProperties = { borderTop: '1px solid var(--border-faint)' };

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
};
