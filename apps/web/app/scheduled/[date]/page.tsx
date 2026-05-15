import { notFound, redirect } from 'next/navigation';

import { cardHeadingStyle, cardStyle, PageShell } from '@/app/(authed)/page-shell';
import { NextSessionTable } from '@/app/dashboard/next-session-table';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadScheduledDayPlans } from '@/lib/data/load-next-workout';

interface PageProps {
  params: { date: string };
}

export const metadata = { title: 'Scheduled workout' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Drill-in for an upcoming day from Jeff's program calendar. Shows the
 * scheduled workout(s) for the chosen date along with the same
 * recommendation table the dashboard renders — so the heatmap's amber cells
 * are actually informative when you click them.
 */
export default async function ScheduledDayPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const date = decodeURIComponent(params.date);
  if (!ISO_DATE.test(date)) notFound();

  const result = await loadScheduledDayPlans(claims.sub, date);
  if (!result) notFound();

  return (
    <PageShell
      current="dashboard"
      userLabel={String(claims.email ?? claims.sub)}
      title={`Scheduled · ${friendlyDate(date)}`}
    >
      <p style={{ margin: '-0.5rem 0 1rem 0', color: 'var(--text-muted)' }}>
        <a href="/dashboard" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ← Back to dashboard
        </a>
      </p>

      {result.plans.length === 0 ? (
        <div style={cardStyle}>
          <h2 style={cardHeadingStyle}>Nothing scheduled here</h2>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-muted)' }}>
            Speediance&apos;s calendar doesn&apos;t list a workout for {friendlyDate(date)}, or you
            already completed everything on that day. The dashboard heatmap may be showing a stale
            view — refresh after the next sync.
          </p>
        </div>
      ) : (
        result.plans.map((plan, i) => (
          <div key={i} style={cardStyle}>
            <h2 style={cardHeadingStyle}>{plan.title ?? 'Workout'}</h2>
            <p
              style={{
                margin: '0.35rem 0 1rem 0',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
              }}
            >
              Scheduled {friendlyDate(date)}.
              {plan.lastCompleted && (
                <>
                  {' '}
                  Last completed{' '}
                  <a
                    href={`/workouts/${encodeURIComponent(plan.lastCompleted.startTime)}`}
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    {friendlyDate(plan.lastCompleted.startTime.slice(0, 10))}
                  </a>
                  .
                </>
              )}{' '}
              <span style={{ color: 'var(--text-faint)' }}>
                &quot;Plan&quot; is Speediance&apos;s prescription. &quot;Suggest&quot; uses your
                lifetime log when the lift has history, otherwise echoes the plan.
              </span>
            </p>
            <NextSessionTable lifts={plan.lifts} />
          </div>
        ))
      )}
    </PageShell>
  );
}

function friendlyDate(iso: string): string {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
