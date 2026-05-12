import { redirect } from 'next/navigation';

import { cardStyle, PageShell, tableStyle, tdStyle, thStyle } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadExercises, type ExerciseSummary } from '@/lib/data/load-exercises';

export const metadata = { title: 'Lift log — speediance-platform' };

export default async function LiftLogPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const exercises = await loadExercises(claims.sub);
  const sorted = [...exercises].sort((a, b) => {
    // Newest activity first.
    const aL = a.lastDone ?? '';
    const bL = b.lastDone ?? '';
    return aL > bL ? -1 : aL < bL ? 1 : 0;
  });

  return (
    <PageShell current="liftlog" userLabel={String(claims.email ?? claims.sub)} title="Lift log">
      <section style={cardStyle}>
        {sorted.length === 0 ? (
          <p style={{ color: '#888', margin: 0 }}>
            No exercise data yet. After the next sync runs, each exercise you&rsquo;ve done shows up
            here with PRs and recency.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Exercise</th>
                  <th style={thStyle}>Group</th>
                  <th style={thStyle}>Last done</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Working</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Best</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Headroom</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sets</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <Row key={e.exerciseId} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Row({ e }: { e: ExerciseSummary }) {
  const headroom =
    e.bestWeight !== undefined && e.workingWeight !== undefined
      ? e.bestWeight - e.workingWeight
      : undefined;
  return (
    <tr>
      <td style={tdStyle}>
        <a
          href={`/exercises/${encodeURIComponent(e.exerciseId)}`}
          style={{ color: '#0b78d1', textDecoration: 'none', fontWeight: 500 }}
        >
          {e.name}
          {e.isUnilateral && (
            <span style={{ marginLeft: '0.4rem', color: '#aaa', fontSize: '0.75rem' }}>L/R</span>
          )}
        </a>
      </td>
      <td style={{ ...tdStyle, color: '#666' }}>{e.muscleGroup ?? '—'}</td>
      <td style={{ ...tdStyle, color: '#666' }}>{e.lastDone ? formatDate(e.lastDone) : '—'}</td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtWt(e.workingWeight)}</td>
      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtWt(e.bestWeight)}</td>
      <td style={{ ...tdStyle, textAlign: 'right', color: headroom === 0 ? '#0d9488' : '#666' }}>
        {headroom === undefined ? '—' : headroom === 0 ? 'at PR' : `${headroom.toFixed(0)}`}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>{e.totalSets ?? '—'}</td>
    </tr>
  );
}

function fmtWt(n: number | undefined): string {
  if (n === undefined) return '—';
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${day}`;
}
