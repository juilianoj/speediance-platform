'use client';

import { useActionState, useState } from 'react';

import { signIn, verifyMfa } from '@/lib/auth/actions';
import type { LoginResult } from '@/lib/auth/types';

const initial: LoginResult | null = null;

/**
 * Two-step login form. State machine:
 *   step 'password' — user enters email + password → signIn Server Action
 *     ↓ (returns { state: 'mfa', session })
 *   step 'mfa'      — user enters TOTP code → verifyMfa Server Action
 *     ↓ (server-side redirect to /dashboard)
 */
export function LoginForm() {
  const [pwState, signInAction, pwPending] = useActionState<LoginResult | null, FormData>(
    signIn,
    initial,
  );
  const [mfaState, verifyMfaAction, mfaPending] = useActionState<LoginResult | null, FormData>(
    verifyMfa,
    initial,
  );
  const [mfaCode, setMfaCode] = useState('');

  const inMfaStep = pwState?.state === 'mfa';
  const session = inMfaStep ? pwState.session : null;

  if (inMfaStep && session) {
    return (
      <form action={verifyMfaAction} style={formStyle}>
        <p>Enter the 6-digit code from your authenticator app.</p>
        <input type="hidden" name="session" value={session} />
        <label style={labelStyle}>
          MFA code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={inputStyle}
          />
        </label>
        {mfaState?.state === 'error' && <p style={errorStyle}>{mfaState.message}</p>}
        <button type="submit" disabled={mfaPending || mfaCode.length !== 6} style={buttonStyle}>
          {mfaPending ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    );
  }

  return (
    <form action={signInAction} style={formStyle}>
      <label style={labelStyle}>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          maxLength={256}
          style={inputStyle}
        />
      </label>
      {pwState?.state === 'error' && <p style={errorStyle}>{pwState.message}</p>}
      <button type="submit" disabled={pwPending} style={buttonStyle}>
        {pwPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  marginTop: '2rem',
  fontFamily: 'system-ui, sans-serif',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  fontSize: '0.95rem',
};

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  fontSize: '1rem',
  border: '1px solid #d0d0d0',
  borderRadius: '6px',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  fontSize: '1rem',
  fontWeight: 600,
  background: '#0b78d1',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  color: '#a00',
  fontSize: '0.9rem',
  margin: 0,
};
