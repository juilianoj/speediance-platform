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

// Default training week starts Wednesday and ends Tuesday — Jeff's
// preferred bucket so he can shift weekend sessions into Mon/Tue without
// crossing a week boundary. Configurable via ?weekStart=0..6 (Sun=0).
const DEFAULT_WEEK_START = 3; // Wednesday
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PageProps {
  searchParams: { weekStart?: string; goal?: string };
}

export default async function AdherencePage({ searchParams }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const weekStart = parseDow(searchParams.weekStart, DEFAULT_WEEK_START);
  const weeklyGoal = parseGoal(searchParams.goal, 4);
  const all = await loadAllWorkouts(claims.sub);

  type WeekRow = {
    weekStartIso: string;
    weekEndIso: string;
    label: string;
    days: Set<number>;
    sessions: number;
    strengthSessions: number;
    cardioSessions: number;
    volume: number;
  };

  // Build the last N weekly buckets keyed by the start-of-week date.
  const today = new Date();
  const buckets: WeekRow[] = [];
  for (let i = WEEKS_TO_SHOW - 1; i >= 0; i--) {
    const start = startOfWeek(addDays(today, -i * 7), weekStart);
    const end = addDays(start, 6);
    buckets.push({
      weekStartIso: start.toISOString().slice(0, 10),
      weekEndIso: end.toISOString().slice(0, 10),
      label: `${shortDate(start)} – ${shortDate(end)}`,
      days: new Set(),
      sessions: 0,
      strengthSessions: 0,
      cardioSessions: 0,
      volume: 0,
    });
  }
  const buckByStart = new Map(buckets.map((b) => [b.weekStartIso, b]));
  for (const w of all) {
    const ws = startOfWeek(new Date(w.startTime), weekStart).toISOString().slice(0, 10);
    const b = buckByStart.get(ws);
    if (!b) continue;
    b.sessions += 1;
    if (w.isCardio || w.speedianceTrainingType === 'cardio') b.cardioSessions += 1;
    else b.strengthSessions += 1;
    b.volume += w.totalCapacity ?? 0;
    b.days.add(new Date(w.startTime).getDay());
  }

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
          label={`${WEEKS_TO_SHOW}-week adherence`}
          value={`${adherence.toFixed(0)}%`}
          sub={`${totals.completed} of ${totals.scheduled}`}
        />
        <Kpi
          label="Total sessions"
          value={String(totals.sessions)}
          sub={`across ${WEEKS_TO_SHOW} weeks`}
        />
        <Kpi
          label="Weekly goal"
          value={`${weeklyGoal} sessions`}
          sub={`Week starts ${DOW_NAMES[weekStart]}`}
        />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Settings</h2>
        <p style={mutedStyle}>
          Both are query-string params for now — full Profile settings later.
        </p>
        <form
          action=""
          method="get"
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            marginTop: '0.75rem',
            alignItems: 'flex-end',
          }}
        >
          <label style={fieldLabelStyle}>
            <span style={fieldSpanStyle}>Week starts on</span>
            <select name="weekStart" defaultValue={String(weekStart)} style={inputStyle}>
              {DOW_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldLabelStyle}>
            <span style={fieldSpanStyle}>Weekly goal</span>
            <input
              name="goal"
              type="number"
              min={1}
              max={14}
              defaultValue={weeklyGoal}
              style={{ ...inputStyle, width: '5rem' }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: '0.55rem 1rem',
              background: '#0b78d1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Apply
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>By week</h2>
        <p style={mutedStyle}>
          {DOW_NAMES[weekStart]}–{DOW_NAMES[(weekStart + 6) % 7]} weeks. Goal: {weeklyGoal}{' '}
          sessions.
        </p>
        <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Week</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Strength</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cardio</th>
                <th style={thStyle}>Days hit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Adherence</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b) => {
                const pct = Math.min(100, (b.sessions / weeklyGoal) * 100);
                return (
                  <tr key={b.weekStartIso}>
                    <td style={tdStyle}>{b.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{b.sessions}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
                      {b.strengthSessions}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
                      {b.cardioSessions}
                    </td>
                    <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.85rem' }}>
                      {[...b.days]
                        .sort()
                        .map((d) => DOW_NAMES[d]?.[0] ?? '?')
                        .join(' ')}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: pct >= 100 ? '#0d9488' : pct === 0 ? '#dc2626' : '#0f172a',
                        fontWeight: 600,
                      }}
                    >
                      {pct.toFixed(0)}%
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>
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

function parseDow(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback;
}

function parseGoal(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) && n >= 1 && n <= 14 ? n : fallback;
}

/** Returns the UTC date of the most recent occurrence of `startDow`
 *  (inclusive of `d`). Day of week in 0=Sun..6=Sat. */
function startOfWeek(d: Date, startDow: number): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const delta = (utc.getUTCDay() - startDow + 7) % 7;
  utc.setUTCDate(utc.getUTCDate() - delta);
  return utc;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function shortDate(d: Date): string {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${m} ${d.getUTCDate()}`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div
        style={{
          color: '#64748b',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{value}</div>
      {sub && (
        <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.2rem' }}>{sub}</div>
      )}
    </div>
  );
}

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.9rem',
  marginBottom: '0.5rem',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

const fieldSpanStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#64748b',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '0.95rem',
  background: '#fff',
};
