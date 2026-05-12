import { redirect } from 'next/navigation';

import { createSecretsStore } from '@speediance/secrets-store';

import { cardHeadingStyle, cardStyle, PageShell } from '@/app/(authed)/page-shell';
import { getMyMfaStatus } from '@/lib/admin/actions';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { loadProfile } from './load-profile';
import { MfaToggle } from './mfa-toggle';
import { ProfileForm } from './profile-form';

export const metadata = {
  title: 'Profile — speediance-platform',
};

export default async function ProfilePage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  // Read the Speediance secret in parallel with the DDB profile. The Speediance
  // login fields (email, region, deviceType, allowMonsterMoves) live in the
  // secret; we used to also mirror them into the profile row, but a buggy sync
  // worker upsert wiped them, so the secret is the canonical source — the row
  // is just the user's preferences (bodyweight, gender, unit, syncStartDate).
  const stage = process.env.SST_STAGE ?? 'dev';
  const secrets = createSecretsStore({ stage });
  const [existing, mfa, secret] = await Promise.all([
    loadProfile(claims.sub),
    getMyMfaStatus(),
    secrets.get(claims.sub).catch(() => null),
  ]);
  const hasSpeedianceCreds = Boolean(existing?.speedianceSecretArn) || Boolean(secret);

  return (
    <PageShell current="profile" userLabel={String(claims.email ?? claims.sub)} title="Profile">
      <p style={{ color: '#666', margin: '-0.5rem 0 1.5rem 0' }}>
        Your Speediance login is stored encrypted in AWS Secrets Manager. The sync worker uses it to
        pull your training history every morning at 5am ET.
      </p>
      <section style={cardStyle}>
        <ProfileForm
          initial={{
            // Prefer the secret for Speediance creds (canonical), fall back
            // to whatever happens to be on the profile row.
            speedianceEmail: secret?.email ?? existing?.email ?? '',
            region: secret?.region ?? existing?.region ?? 'Global',
            deviceType: secret?.deviceType ?? existing?.deviceType ?? 1,
            allowMonsterMoves: secret?.allowMonsterMoves ?? existing?.allowMonsterMoves ?? false,
            bodyweight: existing?.bodyweight,
            gender: existing?.gender,
            unit: existing?.unit ?? 1, // imperial by default for US users
            syncStartDate: existing?.syncStartDate ?? defaultSyncStart(),
          }}
          hasSpeedianceCreds={hasSpeedianceCreds}
        />
      </section>

      <section style={cardStyle}>
        <h2 style={{ ...cardHeadingStyle, marginBottom: '0.75rem' }}>Security</h2>
        <MfaToggle enabled={mfa.enabled} />
      </section>
    </PageShell>
  );
}

/**
 * Default sync start for users who haven't picked one yet. We pull all of
 * history by default: Speediance launched their first product in 2021, so
 * 2018-01-01 is a safe "before any user could possibly have data" floor.
 * The API returns whatever it has and the worker upserts idempotently, so
 * the only cost is one extra round-trip when there's nothing to pull.
 */
function defaultSyncStart(): string {
  return '2018-01-01';
}
