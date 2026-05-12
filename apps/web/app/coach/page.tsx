import { redirect } from 'next/navigation';

import { createDb } from '@speediance/db';

import { cardHeadingStyle, cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { CoachChat } from './chat';

export const metadata = { title: 'Coach — speediance-platform' };

interface ProgramRow {
  programId: string;
  name?: string;
  status?: string;
  plan?: string;
  coachReasoning?: string;
  createdAt?: string;
}

async function loadPrograms(userId: string): Promise<ProgramRow[]> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return [];
  const me = createDb({ tableName }).forUser(userId);
  const result = (await me.programs.list()) as { data: ProgramRow[] };
  return (result.data ?? []).sort((a, b) => ((a.createdAt ?? '') > (b.createdAt ?? '') ? -1 : 1));
}

export default async function CoachPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const programs = await loadPrograms(claims.sub);

  return (
    <PageShell current="coach" userLabel={String(claims.email ?? claims.sub)} title="Coach">
      <p
        style={{
          margin: '-0.5rem 0 1.5rem 0',
          color: '#64748b',
          fontSize: '0.95rem',
          maxWidth: 720,
        }}
      >
        Ask plain-English questions about your training. The coach reads your workout history and
        answers from real data. Ask it to plan a workout and it saves a draft program below.
      </p>

      <section style={cardStyle}>
        <CoachChat />
      </section>

      {programs.length > 0 && (
        <section style={cardStyle}>
          <h2 style={cardHeadingStyle}>Saved programs</h2>
          <p style={mutedStyle}>Drafts the coach has proposed. Newest first.</p>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}
          >
            {programs.map((p) => (
              <ProgramCard key={p.programId} p={p} />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}

function ProgramCard({ p }: { p: ProgramRow }) {
  let plan: {
    focus?: string;
    exercises?: Array<{
      name?: string;
      sets?: number;
      reps?: number;
      weight?: number;
      rest_seconds?: number;
      notes?: string;
    }>;
  } = {};
  try {
    plan = p.plan ? JSON.parse(p.plan) : {};
  } catch {
    plan = {};
  }
  return (
    <div
      style={{
        padding: '1rem 1.1rem',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: '#fafbfc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '0.95rem' }}>{p.name ?? 'Untitled program'}</strong>
        <span style={{ color: '#888', fontSize: '0.78rem' }}>
          {p.status ?? 'draft'} · {p.createdAt ? p.createdAt.slice(0, 10) : '—'}
        </span>
      </div>
      {plan.focus && (
        <p style={{ margin: '0.4rem 0 0 0', color: '#666', fontSize: '0.88rem' }}>{plan.focus}</p>
      )}
      {p.coachReasoning && (
        <p
          style={{
            margin: '0.4rem 0 0 0',
            color: '#444',
            fontSize: '0.88rem',
            fontStyle: 'italic',
          }}
        >
          {p.coachReasoning}
        </p>
      )}
      {plan.exercises && plan.exercises.length > 0 && (
        <ul
          style={{ margin: '0.6rem 0 0 1.2rem', padding: 0, fontSize: '0.88rem', color: '#1a1a1a' }}
        >
          {plan.exercises.map((ex, i) => (
            <li key={i}>
              <strong>{ex.name}</strong> — {ex.sets ?? '?'}×{ex.reps ?? '?'}
              {ex.weight ? ` @ ${ex.weight} lb` : ''}
              {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ''}
              {ex.notes && <span style={{ color: '#888' }}> · {ex.notes}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
