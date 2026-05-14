/**
 * Top nav rendered on all authed pages. Reads the user's profile so it
 * can drop the Cardio link when the user has hidden that section (no
 * Apple Health / Google Fit feed → no cardio data → opted out).
 *
 * Items live in main nav vs the user-menu dropdown based on frequency:
 *   - main: Dashboard, Coach, Lift log, Balance, Cardio (when shown),
 *     Consistency — daily-use pages
 *   - dropdown (avatar): Profile, Feedback, Admin, Sign out — chrome
 *
 * Coach sits up front (right after Dashboard) because the AI coach is the
 * primary value-add of this platform and where users will spend most of
 * their time.
 */
import Link from 'next/link';

import { loadProfile } from '@/app/profile/load-profile';
import { SpeedianceMark } from '@/app/speediance-mark';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { ThemePrefDetector, ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

type Key =
  | 'dashboard'
  | 'liftlog'
  | 'cardio'
  | 'balance'
  | 'consistency'
  | 'coach'
  | 'builder'
  | 'admin'
  | 'feedback'
  | 'profile';

interface Item {
  key: Key;
  label: string;
  href: string;
}

const ALL_ITEMS: Item[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'coach', label: 'Coach', href: '/coach' },
  { key: 'builder', label: 'Builder', href: '/builder' },
  { key: 'liftlog', label: 'Lift log', href: '/lift-log' },
  { key: 'balance', label: 'Balance', href: '/balance' },
  { key: 'cardio', label: 'Cardio', href: '/cardio' },
  { key: 'consistency', label: 'Consistency', href: '/consistency' },
];

const USER_MENU_ITEMS = [
  { label: 'Profile', href: '/profile' },
  { label: 'Feedback', href: '/feedback' },
  { label: 'Admin', href: '/admin' },
];

export async function Nav({ current, userLabel }: { current: Key; userLabel: string }) {
  // Read profile to decide if we should hide the Cardio link. Cached via
  // React.cache so other server components on the same page reuse the
  // result for free.
  const claims = await verifyIdTokenFromCookies();
  const profile = claims ? await loadProfile(claims.sub) : null;
  const items = profile?.hideCardio ? ALL_ITEMS.filter((i) => i.key !== 'cardio') : ALL_ITEMS;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
        // Use a translucent var so the blur effect still works in both
        // themes — the underlying card surface peeks through.
        background: 'color-mix(in srgb, var(--bg-card) 85%, transparent)',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          flexWrap: 'wrap',
        }}
      >
        <Link href="/dashboard" style={brandStyle}>
          <SpeedianceMark size={28} />
          <span style={{ verticalAlign: 'middle', marginLeft: '0.45rem' }}>speediance</span>
        </Link>
        <nav
          style={{
            display: 'flex',
            gap: '0.15rem',
            flex: 1,
            flexWrap: 'wrap',
            marginLeft: '0.5rem',
          }}
        >
          {items.map((i) => (
            <Link
              key={i.key}
              href={i.href}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                textDecoration: 'none',
                color: current === i.key ? 'var(--accent)' : 'var(--text-muted)',
                background: current === i.key ? 'var(--accent-soft)' : 'transparent',
                fontWeight: current === i.key ? 600 : 500,
                transition: 'background 120ms',
              }}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <ThemePrefDetector />
        <UserMenu email={userLabel} items={USER_MENU_ITEMS} />
      </div>
    </header>
  );
}

const brandStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: '1.05rem',
  color: 'var(--text)',
  textDecoration: 'none',
  letterSpacing: '-0.02em',
};
