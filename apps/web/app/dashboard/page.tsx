import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadDashboard, type DashboardData, type DashboardWorkout } from './load-dashboard';
import { MuscleGroupChart } from './muscle-group-chart';
import { SignOutButton } from './signout-button';
import { WeeklyChart } from './weekly-chart';

export const metadata = {
  title: 'Dashboard — speediance-platform',
};

export default async function DashboardPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const display = claims.email ?? claims['cognito:username'] ?? claims.sub;
  const data = await loadDashboard(claims.sub);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '2.5rem auto',
        padding: '0 1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Dashboard</h1>
          <p style={{ color: '#666', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>{display}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="/profile" style={linkStyle}>
            Profile
          </a>
          <SignOutButton />
        </div>
      </header>

      {!data.hasCreds ? (
        <SetupCallout hasProfile={data.hasProfile} />
      ) : (
        <DashboardBody data={data} />
      )}
    </main>
  );
}

function SetupCallout({ hasProfile }: { hasProfile: boolean }) {
  return (
    <section
      style={{
        padding: '1.5rem',
        border: '1px solid #d9e6f5',
        borderRadius: '10px',
        background: '#f3f8fd',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
        {hasProfile ? 'Add your Speediance credentials' : 'Finish setting up your profile'}
      </h2>
      <p style={{ margin: '0 0 1rem 0', color: '#444' }}>
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

function DashboardBody({ data }: { data: DashboardData }) {
  const { thisWeek, weeks, workouts, kpis30d, muscleGroupSets } = data;

  return (
    <>
      {/* Headline KPI strip — what's in the spreadsheet's top row. */}
      <section style={kpiGridStyle}>
        <KpiCard
          accent="#0b78d1"
          label="Strength · 30d"
          value={kpis30d.strengthSessions}
          suffix="sessions"
          sub={`${kpis30d.cardioSessions} cardio`}
        />
        <KpiCard
          accent="#0b78d1"
          label="Volume · 30d"
          value={fmtInt(kpis30d.totalVolume)}
          suffix="capacity"
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

      <section style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardHeadingStyle}>Weekly trend</h2>
          <p style={mutedStyle}>Last 12 weeks. Pick a metric.</p>
        </div>
        <WeeklyChart weeks={weeks} />
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
          <p style={mutedStyle}>Twelve most recent.</p>
        </div>
        {workouts.length === 0 ? (
          <p style={{ color: '#888', margin: 0 }}>
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
  return (
    <tr style={trStyle}>
      <td style={tdStyle}>
        <div style={{ fontWeight: 500 }}>{formatDate(w.startTime)}</div>
        <div style={{ color: '#888', fontSize: '0.8rem' }}>{formatTime(w.startTime)}</div>
      </td>
      <td style={tdStyle}>
        <div>{w.title ?? (isCardio ? 'Cardio' : 'Untitled workout')}</div>
        <div style={{ color: '#888', fontSize: '0.8rem' }}>
          {isCardio
            ? `${w.distanceMiles?.toFixed(2) ?? '—'} mi`
            : (w.courseCategoryName ?? w.speedianceTrainingType ?? '—')}
        </div>
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
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: '1.1rem 1.2rem',
        border: '1px solid #e5e7eb',
        borderTop: accent ? `3px solid ${accent}` : '1px solid #e5e7eb',
        borderRadius: '10px',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div style={kpiLabelStyle}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.3rem' }}>
        <span style={{ fontSize: '1.65rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <span style={{ color: '#666', fontSize: '0.8rem' }}>{suffix}</span>
      </div>
      {sub && <div style={{ color: '#888', fontSize: '0.78rem', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.45rem 0',
        borderBottom: '1px solid #f1f1f1',
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

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

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '1rem',
  marginBottom: '2rem',
};

const linkStyle: React.CSSProperties = {
  color: '#0b78d1',
  fontSize: '0.95rem',
  textDecoration: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 600,
  background: '#0b78d1',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
};

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '0.9rem',
  marginBottom: '1.5rem',
};

const kpiLabelStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
};

const cardStyle: React.CSSProperties = {
  padding: '1.4rem 1.5rem',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  background: '#fff',
  marginBottom: '1.25rem',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};

const cardHeaderStyle: React.CSSProperties = {
  marginBottom: '1rem',
};

const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 600,
};

const mutedStyle: React.CSSProperties = {
  margin: '0.15rem 0 0 0',
  color: '#888',
  fontSize: '0.8rem',
};

const twoColStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '1.25rem',
  marginBottom: '0',
};

const dlStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.92rem',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const trStyle: React.CSSProperties = { borderTop: '1px solid #f1f1f1' };

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: '#666',
  fontWeight: 500,
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
};
