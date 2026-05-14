import { redirect } from 'next/navigation';

import { cardHeadingStyle, cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { listMyFeedback } from '@/lib/feedback/actions';

import { FeedbackForm } from './feedback-form';

export const metadata = { title: 'Feedback — speediance-platform' };

const STATUS_LABEL: Record<string, string> = {
  open: 'New',
  triaged: 'Triaged',
  in_progress: 'In progress',
  done: 'Shipped',
  wontfix: 'Wontfix',
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  open: { bg: 'var(--bg-chip)', fg: 'var(--accent-strong)' },
  triaged: { bg: '#fef3c7', fg: 'var(--warning-text)' },
  in_progress: { bg: '#ede9fe', fg: '#5b21b6' },
  done: { bg: 'var(--accent-soft)', fg: '#065f46' },
  wontfix: { bg: 'var(--danger-bg)', fg: '#991b1b' },
};

export default async function FeedbackPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const mine = await listMyFeedback();

  return (
    <PageShell current="feedback" userLabel={String(claims.email ?? claims.sub)}>
      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Send feedback</h2>
        <p style={mutedStyle}>One submission per click — the form clears on success.</p>
        <FeedbackForm />
      </section>

      {mine.length > 0 && (
        <section style={cardStyle}>
          <h2 style={cardHeadingStyle}>Your submissions</h2>
          <p style={mutedStyle}>Newest first.</p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              marginTop: '0.75rem',
            }}
          >
            {mine.map((f) => {
              const c = STATUS_COLOR[f.status ?? 'open'] ?? STATUS_COLOR.open!;
              return (
                <div
                  key={f.createdAt}
                  style={{
                    padding: '0.85rem 1rem',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid #0b78d1',
                    borderRadius: '8px',
                    background: 'var(--bg-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ fontSize: '0.95rem' }}>{f.subject ?? '(no subject)'}</strong>
                    <span
                      style={{
                        padding: '0.18rem 0.55rem',
                        background: c.bg,
                        color: c.fg,
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {STATUS_LABEL[f.status ?? 'open'] ?? f.status}
                    </span>
                  </div>
                  <div
                    style={{ color: 'var(--text-faint)', fontSize: '0.78rem', marginTop: '0.2rem' }}
                  >
                    {f.category} · {shortDate(f.createdAt)}
                  </div>
                  {f.body && (
                    <p
                      style={{
                        margin: '0.55rem 0 0 0',
                        color: 'var(--text)',
                        fontSize: '0.9rem',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {f.body}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </PageShell>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()} ${d.getFullYear()}`;
}
