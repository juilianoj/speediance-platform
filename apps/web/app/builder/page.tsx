import { redirect } from 'next/navigation';

import { cardHeadingStyle, cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { listMyDrafts } from '@/lib/builder/actions';
import { listExercises } from '@/lib/catalog/lookup';

import { NewWorkoutButton } from './new-workout-button';

export const metadata = { title: 'Builder — speediance-platform' };

/**
 * Builder index. Lists the user's drafts + a "New workout" action. The
 * empty state nudges to /admin if the global catalog hasn't been
 * bootstrapped yet — the builder is unusable without it.
 */
export default async function BuilderIndexPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const [drafts, catalog] = await Promise.all([listMyDrafts(), listExercises()]);
  const catalogReady = catalog.length > 0;

  return (
    <PageShell current="builder" userLabel={String(claims.email ?? claims.sub)}>
      {!catalogReady && (
        <section style={{ ...cardStyle, borderLeft: '3px solid #b45309', background: '#fffbeb' }}>
          <h2 style={cardHeadingStyle}>Catalog not bootstrapped yet</h2>
          <p style={{ ...mutedStyle, color: '#78350f' }}>
            The builder needs a local catalog of Speediance exercises (setup instructions, cable
            position, etc.) before it&rsquo;s useful. Head to{' '}
            <a href="/admin" style={{ color: '#b45309', fontWeight: 600 }}>
              /admin
            </a>
            , click <strong>Bootstrap catalog</strong>, and come back in 3-5 minutes.
          </p>
        </section>
      )}

      <section style={cardStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={cardHeadingStyle}>Your drafts</h2>
            <p style={mutedStyle}>
              Workouts you&rsquo;ve started building. Drafts stay private until you save them to
              Speediance.
            </p>
          </div>
          <NewWorkoutButton disabled={!catalogReady} />
        </div>

        {drafts.length === 0 ? (
          <p style={{ color: '#94a3b8', margin: '1.25rem 0 0 0' }}>
            {catalogReady
              ? 'No drafts yet. Click "New workout" to start one.'
              : 'No drafts yet — bootstrap the catalog first.'}
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '1rem 0 0 0',
              display: 'grid',
              gap: '0.55rem',
            }}
          >
            {drafts.map((d) => (
              <li key={d.draftId}>
                <a
                  href={`/builder/${encodeURIComponent(d.draftId)}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '1.2rem',
                    alignItems: 'center',
                    padding: '0.85rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderLeft:
                      d.status === 'saved-to-speediance'
                        ? '3px solid #0d9488'
                        : '3px solid #94a3b8',
                    borderRadius: '8px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.96rem' }}>{d.name}</div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '0.78rem',
                        marginTop: '0.18rem',
                        display: 'flex',
                        gap: '0.6rem',
                      }}
                    >
                      <span>
                        {(d.exercises ?? []).length} exercise
                        {(d.exercises ?? []).length === 1 ? '' : 's'}
                      </span>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span>edited {shortDate(d.updatedAt ?? d.createdAt)}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      color: d.status === 'saved-to-speediance' ? '#0d9488' : '#94a3b8',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {d.status === 'saved-to-speediance' ? 'Saved' : 'Draft'}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>→</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}
