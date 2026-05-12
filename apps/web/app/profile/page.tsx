import { redirect } from 'next/navigation';

import { cardStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { loadProfile } from './load-profile';
import { ProfileForm } from './profile-form';

export const metadata = {
  title: 'Profile — speediance-platform',
};

export default async function ProfilePage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const existing = await loadProfile(claims.sub);
  const hasSpeedianceCreds = Boolean(existing?.speedianceSecretArn);

  return (
    <PageShell current="profile" userLabel={String(claims.email ?? claims.sub)} title="Profile">
      <p style={{ color: '#666', margin: '-0.5rem 0 1.5rem 0' }}>
        Your Speediance login is stored encrypted in AWS Secrets Manager. The sync worker uses it to
        pull your training history every morning at 5am ET.
      </p>
      <section style={cardStyle}>
        <ProfileForm
          initial={{
            speedianceEmail: existing?.email ?? '',
            region: existing?.region ?? 'Global',
            deviceType: existing?.deviceType ?? 1,
            allowMonsterMoves: existing?.allowMonsterMoves ?? false,
            bodyweight: existing?.bodyweight,
            unit: existing?.unit ?? 1, // imperial by default for US users
            syncStartDate: existing?.syncStartDate ?? defaultSyncStart(),
          }}
          hasSpeedianceCreds={hasSpeedianceCreds}
        />
      </section>
    </PageShell>
  );
}

function defaultSyncStart(): string {
  // 30 days before today, ISO date only.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}
