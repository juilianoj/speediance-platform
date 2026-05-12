/**
 * Top nav rendered on all authed pages. Server component — no client JS
 * just for nav links.
 *
 * The `current` prop is the route key, not a path, so a deep route like
 * /exercises/abc still highlights "Lift log" if we pass currentKey="liftlog"
 * from that page.
 */
import { SignOutButton } from '@/app/dashboard/signout-button';

type Key =
  | 'dashboard'
  | 'liftlog'
  | 'cardio'
  | 'muscles'
  | 'adherence'
  | 'coach'
  | 'admin'
  | 'profile';

const ITEMS: Array<{ key: Key; label: string; href: string }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'liftlog', label: 'Lift log', href: '/lift-log' },
  { key: 'cardio', label: 'Cardio', href: '/cardio' },
  { key: 'muscles', label: 'Muscles', href: '/muscles' },
  { key: 'adherence', label: 'Adherence', href: '/adherence' },
  { key: 'coach', label: 'Coach', href: '/coach' },
  { key: 'admin', label: 'Admin', href: '/admin' },
];

export function Nav({ current, userLabel }: { current: Key; userLabel: string }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.9rem 1.25rem',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}
    >
      <a
        href="/dashboard"
        style={{ fontWeight: 700, color: '#0b78d1', textDecoration: 'none', marginRight: '1rem' }}
      >
        speediance
      </a>
      <nav style={{ display: 'flex', gap: '0.1rem', flex: 1, flexWrap: 'wrap' }}>
        {ITEMS.map((i) => (
          <a
            key={i.key}
            href={i.href}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              textDecoration: 'none',
              color: current === i.key ? '#0b78d1' : '#444',
              background: current === i.key ? '#eef5fc' : 'transparent',
              fontWeight: current === i.key ? 600 : 400,
            }}
          >
            {i.label}
          </a>
        ))}
      </nav>
      <a href="/profile" style={{ fontSize: '0.9rem', color: '#444', textDecoration: 'none' }}>
        {userLabel}
      </a>
      <SignOutButton />
    </header>
  );
}
