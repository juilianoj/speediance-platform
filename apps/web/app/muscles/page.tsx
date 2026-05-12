import { redirect } from 'next/navigation';

import { cardHeadingStyle, cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { MUSCLE_GROUP_ORDER, type MuscleGroupSets } from '@/app/dashboard/load-dashboard';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadAllWorkouts } from '@/lib/data/load-workouts';

import { BodyFigure } from './body-figure';

export const metadata = { title: 'Muscle balance — speediance-platform' };

const LABELS: Record<(typeof MUSCLE_GROUP_ORDER)[number], string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

export default async function MusclesPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const all = await loadAllWorkouts(claims.sub);
  const now = new Date();
  const thirtyAgo = new Date(now);
  thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 30);
  const sevenAgo = new Date(now);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 7);
  const ninetyAgo = new Date(now);
  ninetyAgo.setUTCDate(ninetyAgo.getUTCDate() - 90);

  const sumIn = (after: Date): MuscleGroupSets => {
    const sum: MuscleGroupSets = {};
    for (const w of all) {
      if (!w.muscleGroupSets) continue;
      if (new Date(w.startTime) < after) continue;
      for (const g of MUSCLE_GROUP_ORDER) {
        const v = w.muscleGroupSets[g];
        if (v) sum[g] = (sum[g] ?? 0) + v;
      }
    }
    return sum;
  };

  const wk = sumIn(sevenAgo);
  const m30 = sumIn(thirtyAgo);
  const m90 = sumIn(ninetyAgo);

  return (
    <PageShell
      current="muscles"
      userLabel={String(claims.email ?? claims.sub)}
      title="Muscle balance"
    >
      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>30-day balance</h2>
        <p style={mutedStyle}>Set counts by muscle group, with gap callouts.</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 280px) 1fr',
            gap: '2rem',
            alignItems: 'flex-start',
            marginTop: '0.75rem',
          }}
        >
          <BodyFigure sets={m30} />
          <div>
            <Bars sets={m30} />
            <Gaps sets={m30} />
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Comparison: 7d · 30d · 90d</h2>
        <p style={mutedStyle}>Set counts in three rolling windows.</p>
        <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#666' }}>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #e5e7eb' }}>Group</th>
                <th
                  style={{
                    padding: '0.6rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'right',
                  }}
                >
                  Last 7d
                </th>
                <th
                  style={{
                    padding: '0.6rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'right',
                  }}
                >
                  Last 30d
                </th>
                <th
                  style={{
                    padding: '0.6rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'right',
                  }}
                >
                  Last 90d
                </th>
              </tr>
            </thead>
            <tbody>
              {MUSCLE_GROUP_ORDER.map((g) => (
                <tr key={g} style={{ borderTop: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '0.6rem' }}>{LABELS[g]}</td>
                  <td
                    style={{
                      padding: '0.6rem',
                      textAlign: 'right',
                      color: (wk[g] ?? 0) === 0 ? '#dc2626' : '#1a1a1a',
                    }}
                  >
                    {wk[g] ?? 0}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right' }}>{m30[g] ?? 0}</td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', color: '#666' }}>
                    {m90[g] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Bars({ sets }: { sets: MuscleGroupSets }) {
  const rows = MUSCLE_GROUP_ORDER.map((g) => ({ group: g, label: LABELS[g], v: sets[g] ?? 0 }));
  const total = rows.reduce((s, r) => s + r.v, 0);
  const max = Math.max(...rows.map((r) => r.v), 1);
  if (total === 0) {
    return <p style={{ color: '#888', margin: '1rem 0 0' }}>No sets in the last 30 days.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
      {rows.map((r) => {
        const pct = total > 0 ? (r.v / total) * 100 : 0;
        const w = (r.v / max) * 100;
        return (
          <div
            key={r.group}
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr 96px',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ color: '#444' }}>{r.label}</span>
            <div
              style={{
                height: '18px',
                background: '#f1f4f8',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  background: '#0b78d1',
                  opacity: 0.85,
                }}
              />
            </div>
            <span style={{ color: '#666', textAlign: 'right' }}>
              {r.v} <span style={{ color: '#aaa' }}>({pct.toFixed(0)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Gaps({ sets }: { sets: MuscleGroupSets }) {
  const rows = MUSCLE_GROUP_ORDER.map((g) => ({ group: g, label: LABELS[g], v: sets[g] ?? 0 }));
  const total = rows.reduce((s, r) => s + r.v, 0);
  if (total === 0) return null;
  const avg = total / rows.length;
  const gaps = rows.filter((r) => r.v < avg * 0.5);
  if (gaps.length === 0) {
    return (
      <p style={{ color: '#0d9488', margin: '1rem 0 0', fontSize: '0.9rem' }}>
        Balance looks healthy — no muscle group is below 50% of the average.
      </p>
    );
  }
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        background: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: '6px',
        fontSize: '0.9rem',
      }}
    >
      <strong>Gap callout:</strong> {gaps.map((g) => g.label).join(', ')}{' '}
      {gaps.length === 1 ? 'is' : 'are'} under-trained vs the 30-day average ({Math.round(avg)}{' '}
      sets/group). Consider adding a session.
    </div>
  );
}
