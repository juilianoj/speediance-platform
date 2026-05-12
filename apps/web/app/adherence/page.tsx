import { redirect } from 'next/navigation';

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
import { loadAllWorkouts } from '@/lib/data/load-workouts';

export const metadata = { title: 'Adherence — speediance-platform' };

const WEEKS_TO_SHOW = 12;

export default async function AdherencePage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const all = await loadAllWorkouts(claims.sub);

  // Build last 12 ISO-week buckets keyed by Thursday-of-week.
  const today = new Date();
  type WeekRow = {
    weekIso: string;
    label: string;
    days: Set<string>;
    sessions: number;
    strengthSessions: number;
    cardioSessions: number;
    volume: number;
  };
  const buckets: WeekRow[] = [];
  for (let i = WEEKS_TO_SHOW - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const wk = thursdayOfIsoWeek(d);
    buckets.push({
      weekIso: wk,
      label: shortDate(wk),
      days: new Set(),
      sessions: 0,
      strengthSessions: 0,
      cardioSessions: 0,
      volume: 0,
    });
  }
  const byIso = new Map(buckets.map((b) => [b.weekIso, b]));
  for (const w of all) {
    if (!w.weekIso) continue;
    const b = byIso.get(w.weekIso);
    if (!b) continue;
    b.sessions += 1;
    if (w.isCardio || w.speedianceTrainingType === 'cardio') b.cardioSessions += 1;
    else b.strengthSessions += 1;
    b.volume += w.totalCapacity ?? 0;
    b.days.add(new Date(w.startTime).getDay().toString());
  }

  // Weekly target: assume 4 sessions per week as a default — there's no
  // explicit schedule field on Profile yet. The display calls it "vs goal
  // of 4" to make the assumption visible to the user.
  const weeklyGoal = 4;

  const totals = buckets.reduce(
    (a, b) => ({
      sessions: a.sessions + b.sessions,
      scheduled: a.scheduled + weeklyGoal,
      completed: a.completed + Math.min(b.sessions, weeklyGoal),
    }),
    { sessions: 0, scheduled: 0, completed: 0 },
  );
  const adherence = totals.scheduled > 0 ? (totals.completed / totals.scheduled) * 100 : 0;

  return (
    <PageShell current="adherence" userLabel={String(claims.email ?? claims.sub)} title="Adherence">
      <section style={kpiGridStyle}>
        <Kpi
          label="12-week adherence"
          value={`${adherence.toFixed(0)}%`}
          sub={`${totals.completed} of ${totals.scheduled}`}
        />
        <Kpi label="Total sessions" value={String(totals.sessions)} sub="across 12 weeks" />
        <Kpi
          label="Weekly goal"
          value={`${weeklyGoal} sessions`}
          sub="default — edit Profile to override"
        />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>By week</h2>
        <p style={mutedStyle}>Most recent at top. Goal of {weeklyGoal} sessions/week.</p>
        <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Week of</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Strength</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cardio</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Days hit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Adherence</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b) => {
                const pct = Math.min(100, (b.sessions / weeklyGoal) * 100);
                return (
                  <tr key={b.weekIso}>
                    <td style={tdStyle}>{b.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{b.sessions}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>
                      {b.strengthSessions}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>
                      {b.cardioSessions}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>{b.days.size}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: pct === 100 ? '#0d9488' : pct === 0 ? '#dc2626' : '#1a1a1a',
                        fontWeight: 500,
                      }}
                    >
                      {pct.toFixed(0)}%
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>
                      {Math.round(b.volume).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>{value}</div>
      {sub && <div style={{ color: '#888', fontSize: '0.78rem', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

function thursdayOfIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  return date.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${m} ${d.getUTCDate()}`;
}

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.9rem',
  marginBottom: '0.5rem',
};
