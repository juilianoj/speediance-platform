import { redirect } from 'next/navigation';

import { cardHeadingStyle, cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { listMyDrafts } from '@/lib/builder/actions';
import { listMyPrograms } from '@/lib/builder/program-actions';
import { listExercises } from '@/lib/catalog/lookup';

import { NewProgramButton, NewWorkoutButton } from './new-buttons';

export const metadata = { title: 'Builder' };

/**
 * Builder index. Lists workout + program drafts, with "New workout" and
 * "New program" entry points. Empty state nudges to /admin if the global
 * catalog hasn't been bootstrapped yet — the builder is unusable without
 * it.
 */
export default async function BuilderIndexPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const [drafts, programs, catalog] = await Promise.all([
    listMyDrafts(),
    listMyPrograms(),
    listExercises(),
  ]);
  const catalogReady = catalog.length > 0;

  return (
    <PageShell current="builder" userLabel={String(claims.email ?? claims.sub)}>
      {!catalogReady && (
        <section
          style={{
            ...cardStyle,
            borderLeft: '3px solid var(--warning)',
            background: 'var(--warning-bg)',
          }}
        >
          <h2 style={cardHeadingStyle}>Catalog not bootstrapped yet</h2>
          <p style={{ ...mutedStyle, color: 'var(--warning-text)' }}>
            The builder needs a local catalog of Speediance exercises (setup instructions, cable
            position, etc.) before it&rsquo;s useful. Head to{' '}
            <a href="/admin" style={{ color: 'var(--warning)', fontWeight: 600 }}>
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
            <h2 style={cardHeadingStyle}>Workouts</h2>
            <p style={mutedStyle}>
              Single workouts you&rsquo;ve built. Drafts stay private until you save them to
              Speediance.
            </p>
          </div>
          <NewWorkoutButton disabled={!catalogReady} />
        </div>

        {drafts.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1.25rem 0 0 0' }}>
            {catalogReady ? 'No workouts yet. Click "New workout" to start one.' : '—'}
          </p>
        ) : (
          <DraftList drafts={drafts} />
        )}
      </section>

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
            <h2 style={cardHeadingStyle}>Programs</h2>
            <p style={mutedStyle}>
              Multi-week training programs — arrange workouts into weekly slots and schedule the
              whole thing at once.
            </p>
          </div>
          <NewProgramButton disabled={!catalogReady || drafts.length === 0} />
        </div>

        {programs.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '1.25rem 0 0 0' }}>
            {!catalogReady
              ? '—'
              : drafts.length === 0
                ? 'Build at least one workout above before starting a program.'
                : 'No programs yet. Click "New program" to start one.'}
          </p>
        ) : (
          <ProgramList programs={programs} />
        )}
      </section>
    </PageShell>
  );
}

function DraftList({ drafts }: { drafts: Awaited<ReturnType<typeof listMyDrafts>> }) {
  return (
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
              border: '1px solid var(--border)',
              borderLeft:
                d.status === 'saved-to-speediance'
                  ? '3px solid var(--success)'
                  : '3px solid var(--text-faint)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.96rem' }}>{d.name}</div>
              <div
                style={{
                  color: 'var(--text-muted)',
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
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span>edited {shortDate(d.updatedAt ?? d.createdAt)}</span>
              </div>
            </div>
            <span
              style={{
                color: d.status === 'saved-to-speediance' ? 'var(--success)' : 'var(--text-faint)',
                fontSize: '0.74rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {d.status === 'saved-to-speediance' ? 'Saved' : 'Draft'}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ProgramList({ programs }: { programs: Awaited<ReturnType<typeof listMyPrograms>> }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '1rem 0 0 0',
        display: 'grid',
        gap: '0.55rem',
      }}
    >
      {programs.map((p) => (
        <li key={p.programId}>
          <a
            href={`/builder/programs/${encodeURIComponent(p.programId)}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: '1.2rem',
              alignItems: 'center',
              padding: '0.85rem 1rem',
              border: '1px solid var(--border)',
              borderLeft:
                p.status === 'scheduled'
                  ? '3px solid var(--success)'
                  : '3px solid var(--text-faint)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.96rem' }}>{p.name}</div>
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  marginTop: '0.18rem',
                  display: 'flex',
                  gap: '0.6rem',
                }}
              >
                <span>{p.weekCount}-week cycle</span>
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span>
                  {(p.slots ?? []).length} slot{(p.slots ?? []).length === 1 ? '' : 's'} filled
                </span>
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span>edited {shortDate(p.updatedAt ?? p.createdAt)}</span>
              </div>
            </div>
            <span
              style={{
                color: p.status === 'scheduled' ? 'var(--success)' : 'var(--text-faint)',
                fontSize: '0.74rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {p.status === 'scheduled' ? 'Live' : 'Draft'}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}
