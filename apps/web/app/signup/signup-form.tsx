'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  confirmSignUp,
  resendSignUpCode,
  signUp,
  type ConfirmSignUpResult,
  type ResendCodeResult,
  type SignUpResult,
} from '@/lib/auth/actions';

/**
 * Two-step UI mirroring the forgot-password flow:
 *   1. Register — email + password go in, Cognito emails a 6-digit code,
 *      we advance.
 *   2. Confirm — user enters the code, Cognito marks the account
 *      confirmed, we send them to /login.
 *
 * Cognito's `UsernameExistsException` is intentionally surfaced (not
 * masked) — signup pages need to tell the user "already registered" or
 * they have no idea what to do next.
 */
export function SignUpForm() {
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [email, setEmail] = useState('');

  if (step === 'register') {
    return (
      <RegisterStep
        onSent={(e) => {
          setEmail(e);
          setStep('confirm');
        }}
      />
    );
  }
  return <ConfirmStep email={email} onBack={() => setStep('register')} />;
}

function RegisterStep({ onSent }: { onSent: (email: string) => void }) {
  const [result, action] = useFormState<SignUpResult | null, FormData>(signUp, null);
  const [email, setEmail] = useState('');

  if (result?.state === 'sent') {
    queueMicrotask(() => onSent(email));
  }

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          autoFocus
        />
      </label>
      <label style={labelStyle}>
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          style={inputStyle}
        />
      </label>
      <p style={hintStyle}>12+ characters with mixed case, a number, and a symbol.</p>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      {result?.state === 'alreadyExists' && (
        <div style={infoStyle}>
          {result.message}{' '}
          <a href="/login" style={inlineLinkStyle}>
            Sign in →
          </a>
        </div>
      )}
      <SubmitButton label="Create account" pendingLabel="Creating…" />
      <a href="/login" style={linkStyle}>
        ← Back to sign in
      </a>
    </form>
  );
}

function ConfirmStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [result, action] = useFormState<ConfirmSignUpResult | null, FormData>(confirmSignUp, null);
  const [resendResult, resendAction] = useFormState<ResendCodeResult | null, FormData>(
    resendSignUpCode,
    null,
  );
  const [code, setCode] = useState('');

  if (result?.state === 'done') {
    return (
      <div style={formStyle}>
        <div style={successStyle}>
          <strong>Account confirmed.</strong> Sign in with your email and password.
        </div>
        <a href="/login" style={primaryLinkStyle}>
          Go to sign in →
        </a>
      </div>
    );
  }

  return (
    <form action={action} style={formStyle}>
      <p style={{ color: 'var(--text)', fontSize: '0.92rem', margin: 0 }}>
        We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish creating your
        account.
      </p>
      <input type="hidden" name="email" value={email} />
      <label style={labelStyle}>
        Verification code
        <input
          name="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={inputStyle}
          autoFocus
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <SubmitButton
        label="Confirm account"
        pendingLabel="Confirming…"
        disabled={code.length !== 6}
      />
      <div style={resendRowStyle}>
        <form action={resendAction} style={{ display: 'inline' }}>
          <input type="hidden" name="email" value={email} />
          <ResendButton />
        </form>
        {resendResult?.state === 'sent' && (
          <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>
            New code sent. Check your inbox.
          </span>
        )}
        {resendResult?.state === 'error' && (
          <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{resendResult.message}</span>
        )}
      </div>
      <button type="button" onClick={onBack} style={textButtonStyle}>
        ← Wrong email? Start over
      </button>
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} style={buttonStyle}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={textButtonStyle}>
      {pending ? 'Resending…' : 'Resend code'}
    </button>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  marginTop: '1.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  padding: '0.7rem 0.85rem',
  fontSize: '0.95rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '10px',
  background: 'var(--bg-card)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.8rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 700,
  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(11,120,209,0.35)',
};

const textButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: 'none',
  fontSize: '0.85rem',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  textDecoration: 'none',
  textAlign: 'center',
};

const inlineLinkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontWeight: 600,
  textDecoration: 'none',
};

const primaryLinkStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '0.8rem',
  fontWeight: 700,
  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
  color: 'white',
  borderRadius: '10px',
  textDecoration: 'none',
  boxShadow: '0 4px 12px rgba(11,120,209,0.35)',
};

const errorStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  borderRadius: '8px',
  color: 'var(--danger)',
  fontSize: '0.88rem',
  margin: 0,
};

const infoStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  background: 'var(--accent-soft)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.88rem',
};

const successStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  background: 'var(--accent-soft)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text)',
  fontSize: '0.92rem',
};

const hintStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: '0.78rem',
  margin: 0,
};

const resendRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};
