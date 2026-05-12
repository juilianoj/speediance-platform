/**
 * Top nav rendered on all authed pages. Server component — no client JS
 * just for nav links.
 */
import { SignOutButton } from '@/app/dashboard/signout-button';
import { SpeedianceMark } from '@/app/speediance-mark';

type Key =
  | 'dashboard'
  | 'liftlog'
  | 'cardio'
  | 'muscles'
  | 'adherence'
  | 'coach'
  | 'admin'
  | 'feedback'
  | 'profile';

const ITEMS: Array<{ key: Key; label: string; href: string }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'liftlog', label: 'Lift log', href: '/lift-log' },
  { key: 'cardio', label: 'Cardio', href: '/cardio' },
  { key: 'muscles', label: 'Muscles', href: '/muscles' },
  { key: 'adherence', label: 'Adherence', href: '/adherence' },
  { key: 'coach', label: 'Coach', href: '/coach' },
  { key: 'feedback', label: 'Feedback', href: '/feedback' },
  { key: 'admin', label: 'Admin', href: '/admin' },
];

export function Nav({ current, userLabel }: { current: Key; userLabel: string }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
        background: 'rgba(255,255,255,0.85)',
        borderBottom: '1px solid #e5e7eb',
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
        <a href="/dashboard" style={brandStyle}>
          <SpeedianceMark size={28} />
          <span style={{ verticalAlign: 'middle', marginLeft: '0.45rem' }}>speediance</span>
        </a>
        <nav
          style={{
            display: 'flex',
            gap: '0.15rem',
            flex: 1,
            flexWrap: 'wrap',
            marginLeft: '0.5rem',
          }}
        >
          {ITEMS.map((i) => (
            <a
              key={i.key}
              href={i.href}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                textDecoration: 'none',
                color: current === i.key ? '#0b78d1' : '#475569',
                background: current === i.key ? '#eaf3fb' : 'transparent',
                fontWeight: current === i.key ? 600 : 500,
                transition: 'background 120ms',
              }}
            >
              {i.label}
            </a>
          ))}
        </nav>
        <a href="/profile" style={userLinkStyle}>
          {userLabel}
        </a>
        <SignOutButton />
      </div>
    </header>
  );
}

const brandStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: '1.05rem',
  color: '#0f172a',
  textDecoration: 'none',
  letterSpacing: '-0.02em',
};

const userLinkStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#64748b',
  textDecoration: 'none',
  padding: '0.4rem 0.7rem',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
};
