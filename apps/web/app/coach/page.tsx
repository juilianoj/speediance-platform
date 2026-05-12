import { redirect } from 'next/navigation';

import { cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { CoachChat } from './chat';

export const metadata = { title: 'Coach — speediance-platform' };

export default async function CoachPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <PageShell current="coach" userLabel={String(claims.email ?? claims.sub)} title="Coach">
      <p style={{ margin: '-0.5rem 0 1.5rem 0', color: '#666' }}>
        Ask plain-English questions about your training. The coach reads your DynamoDB workout
        history via tool calls and answers from real data — not guesses.
      </p>

      {!apiKeyConfigured && (
        <div
          style={{
            ...cardStyle,
            background: '#fef3c7',
            borderColor: '#fde68a',
            color: '#78350f',
          }}
        >
          <strong>Coach is not configured yet.</strong> The Lambda is missing an{' '}
          <code>ANTHROPIC_API_KEY</code> env var. Set one in SST and redeploy — see{' '}
          <code>infra/stacks/Web.ts</code>.
        </div>
      )}

      <section style={cardStyle}>
        <CoachChat />
      </section>

      <section style={{ ...cardStyle, background: '#fafbfc' }}>
        <strong style={{ fontSize: '0.9rem' }}>Try asking:</strong>
        <ul style={{ margin: '0.6rem 0 0 1.25rem', padding: 0, color: '#444', fontSize: '0.9rem' }}>
          <li>When did I last train chest?</li>
          <li>What&rsquo;s my best bench press?</li>
          <li>How was last week compared to the week before?</li>
          <li>Which muscle group have I been neglecting?</li>
          <li>How close am I to a PR on shoulder press?</li>
        </ul>
        <p style={{ ...mutedStyle, marginTop: '0.6rem' }}>
          The coach makes suggestions only — it can&rsquo;t schedule workouts yet (Phase 3.x).
        </p>
      </section>
    </PageShell>
  );
}
