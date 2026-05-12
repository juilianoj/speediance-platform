'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  confirmPasswordReset,
  requestPasswordReset,
  type ConfirmResetResult,
  type ForgotPasswordResult,
} from '@/lib/auth/actions';

/**
 * Two-step UI:
 *   1. Request — email goes in, Cognito emails a code, we advance.
 *   2. Confirm — user enters code + new password, Cognito sets the password.
 *
 * The flow always advances to step 2 even if the email isn't registered
 * (Cognito won't error on that path), so we don't leak account existence.
 */
export function ForgotPasswordForm() {
  const [step, setStep] = useState<'email' | 'confirm'>('email');
  const [email, setEmail] = useState('');

  if (step === 'email') {
    return (
      <RequestStep
        onSent={(e) => {
          setEmail(e);
          setStep('confirm');
        }}
      />
    );
  }
  return <ConfirmStep email={email} onBack={() => setStep('email')} />;
}

function RequestStep({ onSent }: { onSent: (email: string) => void }) {
  const [result, action] = useFormState<ForgotPasswordResult | null, FormData>(
    requestPasswordReset,
    null,
  );
  const [email, setEmail] = useState('');

  // When the server action returns 'sent', advance the parent state.
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
        />
      </label>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <SubmitButton label="Send code" pendingLabel="Sending…" />
      <a href="/login" style={linkStyle}>
        ← Back to sign in
      </a>
    </form>
  );
}

function ConfirmStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [result, action] = useFormState<ConfirmResetResult | null, FormData>(
    confirmPasswordReset,
    null,
  );
  const [code, setCode] = useState('');

  if (result?.state === 'done') {
    return (
      <div style={formStyle}>
        <div style={successStyle}>
          <strong>Password updated.</strong> Sign in with your new password.
        </div>
        <a href="/login" style={primaryLinkStyle}>
          Go to sign in →
        </a>
      </div>
    );
  }

  return (
    <form action={action} style={formStyle}>
      <p style={{ color: '#0f172a', fontSize: '0.92rem', margin: 0 }}>
        If that email is registered, a 6-digit code is on its way. It expires in 15 minutes.
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
      <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0 }}>
        12+ characters, mixed case, a number, and a symbol.
      </p>
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}
      <SubmitButton label="Set new password" pendingLabel="Saving…" disabled={code.length !== 6} />
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
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  padding: '0.7rem 0.85rem',
  fontSize: '0.95rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  background: '#fff',
  color: '#0f172a',
  fontFamily: 'inherit',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.8rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 700,
  background: 'linear-gradient(135deg, #0b78d1 0%, #0b5fa8 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(11,120,209,0.35)',
};

const textButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#64748b',
  border: 'none',
  fontSize: '0.85rem',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};

const linkStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '0.85rem',
  textDecoration: 'none',
  textAlign: 'center',
};

const primaryLinkStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '0.8rem',
  fontWeight: 700,
  background: 'linear-gradient(135deg, #0b78d1 0%, #0b5fa8 100%)',
  color: 'white',
  borderRadius: '10px',
  textDecoration: 'none',
  boxShadow: '0 4px 12px rgba(11,120,209,0.35)',
};

const errorStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  color: '#b91c1c',
  fontSize: '0.88rem',
  margin: 0,
};

const successStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  background: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: '10px',
  color: '#065f46',
  fontSize: '0.92rem',
};
