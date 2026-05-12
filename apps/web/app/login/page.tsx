import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in — speediance-platform',
};

// Server component. If the user already has a valid id_token cookie we
// short-circuit and send them to /dashboard so the back button doesn't
// strand them on the login screen.
export default async function LoginPage() {
  const claims = await verifyIdTokenFromCookies();
  if (claims) redirect('/dashboard');

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ margin: 0 }}>Sign in</h1>
      <p style={{ color: '#666', marginTop: '0.25rem' }}>speediance-platform — invite-only</p>
      <LoginForm />
    </main>
  );
}
