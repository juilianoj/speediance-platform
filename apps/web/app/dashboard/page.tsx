import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadDashboard, type DashboardData } from './load-dashboard';
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
        maxWidth: 920,
        margin: '3rem auto',
        padding: '0 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '1rem',
          marginBottom: '0.25rem',
        }}
      >
        <h1 style={{ margin: 0, flex: 1 }}>Dashboard</h1>
        <a href="/profile" style={linkStyle}>
          Profile
        </a>
        <SignOutButton />
      </header>
      <p style={{ color: '#666', margin: '0 0 2rem 0' }}>Signed in as {display}</p>

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
        borderRadius: '8px',
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
        style={{
          ...buttonStyle,
          display: 'inline-block',
          textDecoration: 'none',
        }}
      >
        Open profile →
      </a>
    </section>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const { thisWeek, weeks, workouts } = data;
  const totalVolume12w = weeks.reduce((s, w) => s + w.volume, 0);
  const totalWorkouts12w = weeks.reduce((s, w) => s + w.workouts, 0);

  return (
    <>
      <section style={kpiGridStyle}>
        <KpiCard label="This week" value={thisWeek.workouts} suffix="workouts" />
        <KpiCard
          label="This week volume"
          value={Math.round(thisWeek.volume).toLocaleString()}
          suffix="capacity"
        />
        <KpiCard
          label="12-week volume"
          value={Math.round(totalVolume12w).toLocaleString()}
          suffix="capacity"
        />
        <KpiCard label="12-week workouts" value={totalWorkouts12w} suffix="sessions" />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Weekly volume</h2>
        <WeeklyChart weeks={weeks} />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Recent sessions</h2>
        {workouts.length === 0 ? (
          <p style={{ color: '#888', margin: 0 }}>
            No workouts pulled yet. The next sync runs every morning, or after you save your
            profile.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#666', fontSize: '0.85rem' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {workouts.map((w) => (
                <tr key={w.startTime} style={{ borderTop: '1px solid #eee' }}>
                  <td style={tdStyle}>{formatDate(w.startTime)}</td>
                  <td style={tdStyle}>{w.title ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.totalCapacity ? Math.round(w.totalCapacity).toLocaleString() : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {w.durationSeconds ? formatDuration(w.durationSeconds) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function KpiCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix: string;
}) {
  return (
    <div
      style={{
        padding: '1.25rem',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        background: '#fff',
      }}
    >
      <div
        style={{
          color: '#666',
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 700, marginTop: '0.3rem' }}>{value}</div>
      <div style={{ color: '#888', fontSize: '0.85rem' }}>{suffix}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${day}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

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
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '1rem',
  marginBottom: '2rem',
};

const cardStyle: React.CSSProperties = {
  padding: '1.5rem',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  background: '#fff',
  marginBottom: '1.5rem',
};

const cardHeadingStyle: React.CSSProperties = {
  margin: '0 0 1rem 0',
  fontSize: '1.05rem',
};

const thStyle: React.CSSProperties = {
  padding: '0.5rem',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.5rem',
};
