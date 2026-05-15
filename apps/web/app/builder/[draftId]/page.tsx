import { notFound, redirect } from 'next/navigation';

import { PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { getDraft } from '@/lib/builder/actions';
import { listExercises } from '@/lib/catalog/lookup';

import { Editor } from './editor';

export const metadata = { title: 'Workout' };

interface PageProps {
  params: { draftId: string };
}

export default async function BuilderEditorPage({ params }: PageProps) {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const draftId = decodeURIComponent(params.draftId);
  const [draft, catalog] = await Promise.all([getDraft(draftId), listExercises()]);
  if (!draft) notFound();

  return (
    <PageShell current="builder" userLabel={String(claims.email ?? claims.sub)} title={draft.name}>
      <p style={{ margin: '-0.5rem 0 1rem 0', color: 'var(--text-muted)' }}>
        <a href="/builder" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ← Back to drafts
        </a>
      </p>
      <Editor draft={draft} catalog={catalog} />
    </PageShell>
  );
}
