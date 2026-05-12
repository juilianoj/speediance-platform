import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_NAMES, verifyIdToken } from '@/lib/auth/session';

/**
 * Auth middleware. Runs at the edge before any matched route handler, so an
 * unauthenticated request to `/dashboard` is intercepted before the page
 * renders (and before any data fetch can leak information).
 *
 * The matcher below scopes this to protected paths only; public paths
 * (`/login`, `/api/auth/*`, static assets) are unmatched and pass through
 * without verification.
 *
 * Note: `aws-jwt-verify` performs a JWKS fetch the first time it runs in a
 * given Lambda execution context. After the first cold-start request the
 * key set is cached in memory.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAMES.id)?.value;
  const claims = await verifyIdToken(token);
  if (!claims) {
    const loginUrl = new URL('/login', req.url);
    // Preserve the requested URL so we can deep-link back after auth.
    // For now /login always lands on /dashboard, so the param is unused —
    // wire it up when we have multiple authenticated routes.
    loginUrl.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Protect authenticated route trees. Add new ones here (e.g. '/admin/:path*')
  // as they land.
  matcher: [
    '/dashboard/:path*',
    '/profile/:path*',
    '/lift-log/:path*',
    '/exercises/:path*',
    '/cardio/:path*',
    '/muscles/:path*',
    '/adherence/:path*',
    '/coach/:path*',
    '/admin/:path*',
    '/workouts/:path*',
    '/feedback/:path*',
  ],
};
