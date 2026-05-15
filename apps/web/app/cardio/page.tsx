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
import { loadProfile } from '@/app/profile/load-profile';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadAllWorkouts } from '@/lib/data/load-workouts';

import { HideCardioButton } from './hide-cardio-button';

export const metadata = { title: 'Cardio' };

export default async function CardioPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const [all, profile] = await Promise.all([loadAllWorkouts(claims.sub), loadProfile(claims.sub)]);

  // User explicitly hid cardio — bounce them home.
  if (profile?.hideCardio) redirect('/dashboard');

  const cardio = all.filter((w) => w.isCardio || w.speedianceTrainingType === 'cardio');

  // Empty state — explain where cardio data comes from + offer to hide the
  // section entirely. Avoids the dead-feeling page when the user hasn't
  // hooked Apple Health / Google Fit into their Speediance app.
  if (cardio.length === 0) {
    return (
      <PageShell current="cardio" userLabel={String(claims.email ?? claims.sub)}>
        <section style={cardStyle}>
          <h2 style={cardHeadingStyle}>No cardio sessions yet</h2>
          <p style={{ margin: '0.4rem 0 0.8rem 0', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Speediance only logs cardio when their mobile app is connected to{' '}
            <strong>Apple Health</strong> (iOS) or <strong>Google Fit</strong> (Android). Walks,
            runs, and bike sessions sync from there into your Speediance training history, then we
            pull them down here on the next sync.
          </p>
          <p style={{ margin: '0 0 0.6rem 0', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            <strong>To connect it:</strong> open the Speediance app → Profile → Health Data → enable
            the Apple Health / Google Fit integration. Future walks will show up here after the next
            morning&apos;s sync.
          </p>
          <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: '0.85rem' }}>
            Not interested? Hide the Cardio section — you can re-enable it any time from your
            Profile.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <HideCardioButton />
          </div>
        </section>
      </PageShell>
    );
  }

  // Group by ISO week.
  type WeekRow = {
    weekIso: string;
    label: string;
    sessions: number;
    miles: number;
    calories: number;
    durationMinutes: number;
  };
  const weekMap = new Map<string, WeekRow>();
  for (const w of cardio) {
    if (!w.weekIso) continue;
    if (!weekMap.has(w.weekIso)) {
      // weekIso is the Thursday of the ISO week. The bucket actually
      // covers Mon..Sun — show the full range so the user can match
      // sessions to weeks at a glance.
      weekMap.set(w.weekIso, {
        weekIso: w.weekIso,
        label: weekRangeLabel(w.weekIso),
        sessions: 0,
        miles: 0,
        calories: 0,
        durationMinutes: 0,
      });
    }
    const row = weekMap.get(w.weekIso)!;
    row.sessions += 1;
    row.miles += w.distanceMiles ?? 0;
    row.calories += w.calories ?? 0;
    row.durationMinutes += (w.durationSeconds ?? 0) / 60;
  }
  const weeks = [...weekMap.values()].sort((a, b) => (a.weekIso > b.weekIso ? -1 : 1));

  const totals = {
    sessions: cardio.length,
    miles: cardio.reduce((s, w) => s + (w.distanceMiles ?? 0), 0),
    calories: cardio.reduce((s, w) => s + (w.calories ?? 0), 0),
    minutes: cardio.reduce((s, w) => s + (w.durationSeconds ?? 0) / 60, 0),
  };
  const avgPace = totals.miles > 0 ? totals.minutes / totals.miles : 0;

  return (
    <PageShell current="cardio" userLabel={String(claims.email ?? claims.sub)}>
      <section style={kpiGridStyle}>
        <Kpi label="Sessions" value={String(totals.sessions)} />
        <Kpi label="Miles" value={totals.miles.toFixed(1)} />
        <Kpi label="Calories" value={Math.round(totals.calories).toLocaleString()} />
        <Kpi label="Avg pace" value={avgPace > 0 ? `${avgPace.toFixed(1)} min/mi` : '—'} />
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>By week</h2>
        <p style={mutedStyle}>Walks and runs aggregated by ISO week.</p>
        {weeks.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1rem 0 0' }}>No cardio sessions yet.</p>
        ) : (
          <table style={{ ...tableStyle, marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Week</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Miles</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Calories</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekIso}>
                  <td style={tdStyle}>{w.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{w.sessions}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{w.miles.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {Math.round(w.calories).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {Math.round(w.durationMinutes)}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Recent sessions</h2>
        {cardio.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1rem 0 0' }}>No cardio yet.</p>
        ) : (
          <table style={{ ...tableStyle, marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Distance</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Pace</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Calories</th>
              </tr>
            </thead>
            <tbody>
              {cardio.slice(0, 15).map((w) => {
                const miles = w.distanceMiles ?? 0;
                const minutes = (w.durationSeconds ?? 0) / 60;
                const pace = miles > 0 ? minutes / miles : 0;
                return (
                  <tr key={w.startTime}>
                    <td style={tdStyle}>{formatDate(w.startTime)}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      {w.title ?? 'Cardio'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{miles.toFixed(2)} mi</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Math.round(minutes)}m</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {pace > 0 ? `${pace.toFixed(1)}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {w.calories ? Math.round(w.calories).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </PageShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
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
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>{value}</div>
    </div>
  );
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

/** weekIso is the Thursday of an ISO week. Render "Mon–Sun" range. */
function weekRangeLabel(thursdayIso: string): string {
  const d = new Date(thursdayIso + 'T00:00:00Z');
  const mon = new Date(d);
  mon.setUTCDate(mon.getUTCDate() - 3);
  const sun = new Date(d);
  sun.setUTCDate(sun.getUTCDate() + 3);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[mon.getUTCMonth()]} ${mon.getUTCDate()} – ${m[sun.getUTCMonth()]} ${sun.getUTCDate()}`;
}

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.9rem',
  marginBottom: '0.5rem',
};
