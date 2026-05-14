import { redirect } from 'next/navigation';

import { SpeedianceMark } from '@/app/speediance-mark';
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
    <div style={wrapStyle}>
      <div style={panelStyle}>
        <div style={brandRowStyle}>
          <SpeedianceMark size={32} />
          <span style={brandTextStyle}>speediance</span>
        </div>
        <div style={eyebrowStyle}>Invite-only</div>
        <h1 style={h1Style}>Welcome back</h1>
        <p style={subStyle}>
          Sign in to see your training history, progression, and what to do next.
        </p>
        <LoginForm />
      </div>
      <p style={footnoteStyle}>
        <a
          href="/forgot-password"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          Forgot your password?
        </a>{' '}
        · New here? You need an emailed invite — invite-only platform.
      </p>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3rem 1.5rem',
  // Subtle radial highlights that work in both themes. The base color
  // is the page background; the highlights are accent-soft tints.
  background:
    'radial-gradient(circle at 20% 0%, var(--accent-soft) 0%, transparent 50%), ' +
    'radial-gradient(circle at 100% 100%, var(--accent-soft) 0%, transparent 55%), ' +
    'var(--bg-page)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  color: 'var(--text)',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  padding: '2rem 2rem 2.25rem 2rem',
  boxShadow: 'var(--shadow-card)',
};

const brandRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
  marginBottom: '1.25rem',
};

const brandTextStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 800,
  color: 'var(--text)',
  letterSpacing: '-0.02em',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.18rem 0.6rem',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  borderRadius: '999px',
  marginBottom: '0.65rem',
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: '1.9rem',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--text)',
};

const subStyle: React.CSSProperties = {
  margin: '0.35rem 0 0 0',
  color: 'var(--text-muted)',
  fontSize: '0.92rem',
  lineHeight: 1.5,
};

const footnoteStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  maxWidth: 420,
  fontSize: '0.78rem',
  color: 'var(--text-faint)',
  textAlign: 'center',
  lineHeight: 1.6,
};
