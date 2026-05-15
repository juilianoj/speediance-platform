import { redirect } from 'next/navigation';

import { SpeedianceMark } from '@/app/speediance-mark';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { SignUpForm } from './signup-form';

export const metadata = {
  title: 'Sign up',
};

export default async function SignUpPage() {
  const claims = await verifyIdTokenFromCookies();
  if (claims) redirect('/dashboard');

  return (
    <div style={wrapStyle}>
      <div style={panelStyle}>
        <div style={brandRowStyle}>
          <SpeedianceMark size={32} />
          <span style={brandTextStyle}>speediance</span>
        </div>
        <h1 style={h1Style}>Create your account</h1>
        <p style={subStyle}>
          Self-hosted dashboard for your Speediance training. Bring your existing Speediance login
          and we&rsquo;ll sync your history.
        </p>
        <SignUpForm />
      </div>
      <p style={footnoteStyle}>
        Already have an account?{' '}
        <a
          href="/login"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          Sign in →
        </a>
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
  fontSize: '0.85rem',
  color: 'var(--text-faint)',
  textAlign: 'center',
  lineHeight: 1.6,
};
