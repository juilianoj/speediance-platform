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
    <div style={wrapStyle}>
      <div style={panelStyle}>
        <div style={brandRowStyle}>
          <span style={badgeStyle} />
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
        Forgot your password? Ping the admin to reset. New here? You need an emailed invite —
        invite-only platform.
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
  background:
    'radial-gradient(circle at 20% 0%, #e0eaf7 0%, transparent 50%), ' +
    'radial-gradient(circle at 100% 100%, #ede5fb 0%, transparent 55%), ' +
    'linear-gradient(180deg, #f7f8fa 0%, #ffffff 100%)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  color: '#0f172a',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '2rem 2rem 2.25rem 2rem',
  boxShadow: '0 12px 40px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
};

const brandRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
  marginBottom: '1.25rem',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 30,
  height: 30,
  borderRadius: '8px',
  background: 'linear-gradient(135deg, #0b78d1 0%, #7c3aed 100%)',
  boxShadow: '0 3px 10px rgba(11,120,209,0.45)',
};

const brandTextStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 800,
  color: '#0f172a',
  letterSpacing: '-0.02em',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.18rem 0.6rem',
  background: '#eef2ff',
  color: '#4338ca',
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
  color: '#0f172a',
};

const subStyle: React.CSSProperties = {
  margin: '0.35rem 0 0 0',
  color: '#64748b',
  fontSize: '0.92rem',
  lineHeight: 1.5,
};

const footnoteStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  maxWidth: 420,
  fontSize: '0.78rem',
  color: '#94a3b8',
  textAlign: 'center',
  lineHeight: 1.6,
};
