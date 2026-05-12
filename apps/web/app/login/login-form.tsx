'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActionState } from 'react';
import QRCode from 'qrcode';

import { setNewPassword, signIn, verifyMfa, verifyMfaSetup } from '@/lib/auth/actions';
import type { LoginResult } from '@/lib/auth/types';

/**
 * Multi-step login state machine driven by Cognito's challenge responses.
 *
 * password (default)
 *   ↓ signIn
 *   ├─ → mfa          → verifyMfa  → /dashboard
 *   ├─ → newPassword  → setNewPassword
 *   │     ↓ (may chain into mfaSetup)
 *   │     → mfaSetup  → verifyMfaSetup  → /dashboard
 *   └─ → mfaSetup     → verifyMfaSetup  → /dashboard
 *
 * Each step renders a focused form and re-uses `useActionState` so the
 * pending / error states are intrinsic to the Server Action call.
 */
export function LoginForm() {
  // Top-level driver state — captures the result of the most recent Server
  // Action so we know which step to render. Each step then runs its OWN
  // useActionState for its specific action; transitions are explicit when
  // a step's terminal action returns a new top-level state.
  const [topState, setTopState] = useState<LoginResult | null>(null);

  // Step decoupling: each subform pulls in the latest result and "promotes"
  // it to topState so we move forward. We could collapse this into one big
  // useActionState, but per-step actions give Next.js cleaner pending state
  // (the submit buttons disable independently).
  if (!topState || topState.state === 'error') {
    return <PasswordStep priorError={topState} onAdvance={setTopState} />;
  }
  if (topState.state === 'mfa') {
    return <MfaStep state={topState} onAdvance={setTopState} />;
  }
  if (topState.state === 'newPassword') {
    return <NewPasswordStep state={topState} onAdvance={setTopState} />;
  }
  if (topState.state === 'mfaSetup') {
    return <MfaSetupStep state={topState} onAdvance={setTopState} />;
  }
  // 'ok' — redirect already happened server-side; this branch is unreachable
  // in practice but keeps the union exhaustive.
  return null;
}

// ─── Steps ──────────────────────────────────────────────────────────────

function PasswordStep({
  priorError,
  onAdvance,
}: {
  priorError: LoginResult | null;
  onAdvance: (r: LoginResult) => void;
}) {
  const [result, action, pending] = useActionState<LoginResult | null, FormData>(
    signIn,
    priorError,
  );
  useEffect(() => {
    if (result && result.state !== 'error') onAdvance(result);
  }, [result, onAdvance]);

  return (
    <form action={action} style={formStyle}>
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
          minLength={1}
          maxLength={256}
          style={inputStyle}
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <button type="submit" disabled={pending} style={buttonStyle}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function MfaStep({
  state,
  onAdvance,
}: {
  state: Extract<LoginResult, { state: 'mfa' }>;
  onAdvance: (r: LoginResult) => void;
}) {
  const [result, action, pending] = useActionState<LoginResult | null, FormData>(verifyMfa, null);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (result && result.state !== 'error') onAdvance(result);
  }, [result, onAdvance]);

  return (
    <form action={action} style={formStyle}>
      <p>Enter the 6-digit code from your authenticator app.</p>
      <input type="hidden" name="session" value={state.session} />
      <input type="hidden" name="username" value={state.username} />
      <label style={labelStyle}>
        MFA code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={inputStyle}
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <button type="submit" disabled={pending || code.length !== 6} style={buttonStyle}>
        {pending ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  );
}

function NewPasswordStep({
  state,
  onAdvance,
}: {
  state: Extract<LoginResult, { state: 'newPassword' }>;
  onAdvance: (r: LoginResult) => void;
}) {
  const [result, action, pending] = useActionState<LoginResult | null, FormData>(
    setNewPassword,
    null,
  );
  useEffect(() => {
    if (result && result.state !== 'error') onAdvance(result);
  }, [result, onAdvance]);

  return (
    <form action={action} style={formStyle}>
      <p>
        Welcome — pick a permanent password. Must be 12+ characters with mixed case, a number, and a
        symbol.
      </p>
      <input type="hidden" name="session" value={state.session} />
      <input type="hidden" name="username" value={state.username} />
      <label style={labelStyle}>
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          style={inputStyle}
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <button type="submit" disabled={pending} style={buttonStyle}>
        {pending ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  );
}

function MfaSetupStep({
  state,
  onAdvance,
}: {
  state: Extract<LoginResult, { state: 'mfaSetup' }>;
  onAdvance: (r: LoginResult) => void;
}) {
  const [result, action, pending] = useActionState<LoginResult | null, FormData>(
    verifyMfaSetup,
    null,
  );
  const [code, setCode] = useState('');
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  useEffect(() => {
    if (result && result.state !== 'error') onAdvance(result);
  }, [result, onAdvance]);

  // Render the QR client-side. Avoiding a server round-trip means the QR
  // can be regenerated on retry without needing another Cognito call.
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(state.otpauthUri, { type: 'svg', margin: 1, width: 220 })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch((err: unknown) => {
        console.error('QR render failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [state.otpauthUri]);

  const formattedSecret = useMemo(
    () => state.secretCode.match(/.{1,4}/g)?.join(' '),
    [state.secretCode],
  );

  return (
    <form action={action} style={formStyle}>
      <p>
        Add this account to your authenticator app (1Password, Authy, Google Authenticator). Scan
        the QR or type the secret in manually, then enter the 6-digit code your app shows.
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          background: '#fafafa',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
        }}
      >
        {qrSvg ? (
          <span dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="MFA QR code" />
        ) : (
          <span style={{ color: '#999' }}>Rendering QR…</span>
        )}
        <code
          style={{
            display: 'block',
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            wordBreak: 'break-all',
            color: '#444',
          }}
        >
          {formattedSecret}
        </code>
      </div>
      <input type="hidden" name="session" value={state.session} />
      <input type="hidden" name="username" value={state.username} />
      <label style={labelStyle}>
        Code from your authenticator
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={inputStyle}
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <button type="submit" disabled={pending || code.length !== 6} style={buttonStyle}>
        {pending ? 'Confirming…' : 'Confirm and finish'}
      </button>
    </form>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────

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
