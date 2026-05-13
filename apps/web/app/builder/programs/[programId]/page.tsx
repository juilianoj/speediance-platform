import { notFound, redirect } from 'next/navigation';

import { PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { listMyDrafts } from '@/lib/builder/actions';
import { getProgram } from '@/lib/builder/program-actions';

import { ProgramEditor } from './editor';

export const metadata = { title: 'Program — speediance-platform' };

interface PageProps {
  params: { programId: string };
}

export default async function ProgramEditorPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const programId = decodeURIComponent(params.programId);
  const [program, drafts] = await Promise.all([getProgram(programId), listMyDrafts()]);
  if (!program) notFound();

  return (
    <PageShell
      current="builder"
      userLabel={String(claims.email ?? claims.sub)}
      title={program.name}
    >
      <p style={{ margin: '-0.5rem 0 1rem 0', color: '#666' }}>
        <a href="/builder" style={{ color: '#0b78d1', textDecoration: 'none' }}>
          ← Back to builder
        </a>
      </p>
      <ProgramEditor program={program} drafts={drafts} />
    </PageShell>
  );
}
