import { redirect } from 'next/navigation';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

// Invite-only platform — no marketing landing page. `/` just routes you to
// wherever your auth state says you should be.
export default async function HomePage() {
  const claims = await verifyIdTokenFromCookies();
  redirect(claims ? '/dashboard' : '/login');
}
