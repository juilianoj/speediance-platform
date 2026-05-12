import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { SignOutButton } from './signout-button';

export const metadata = {
  title: 'Dashboard — speediance-platform',
};

// Server-rendered. Middleware (apps/web/middleware.ts) blocks unauthenticated
// requests before they reach this handler, but we re-check here for defense
// in depth: if the cookie is somehow present-but-invalid, redirect cleanly
// instead of throwing in the JWT verifier.
export default async function DashboardPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const display = claims.email ?? claims['cognito:username'] ?? claims.sub;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '4rem auto',
        padding: '0 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
        <h1 style={{ margin: 0, flex: 1 }}>Dashboard</h1>
        <SignOutButton />
      </header>
      <p style={{ color: '#444', marginTop: '1.5rem' }}>
        Signed in as <strong>{display}</strong>.
      </p>
      <p style={{ color: '#666' }}>
        Real KPI cards arrive in Phase 2. Phase 1 wires up the sync worker that fills DynamoDB with
        your Speediance training history.
      </p>
    </main>
  );
}
