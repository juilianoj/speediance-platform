import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { ProfileForm } from './profile-form';
import { loadProfile } from './load-profile';

export const metadata = {
  title: 'Profile — speediance-platform',
};

export default async function ProfilePage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const existing = await loadProfile(claims.sub);
  const hasSpeedianceCreds = Boolean(existing?.speedianceSecretArn);

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '4rem auto',
        padding: '0 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
        <h1 style={{ margin: 0, flex: 1 }}>Profile</h1>
        <a
          href="/dashboard"
          style={{ color: '#0b78d1', fontSize: '0.95rem', textDecoration: 'none' }}
        >
          ← Dashboard
        </a>
      </header>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        Your Speediance login is stored encrypted in AWS Secrets Manager. The sync worker uses it to
        pull your training history every morning at 5am ET.
      </p>
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
    </main>
  );
}

function defaultSyncStart(): string {
  // 30 days before today, ISO date only.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}
