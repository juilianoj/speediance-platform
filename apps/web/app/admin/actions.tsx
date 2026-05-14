'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  hardDeleteUser,
  inviteUser,
  rebuildExerciseCatalog,
  resyncMe,
  setUserEnabled,
  type InviteResult,
} from '@/lib/admin/actions';

export function ResyncButton() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setStatus(null);
            const res = await resyncMe();
            setStatus(res);
          })
        }
        style={primaryButton(pending)}
      >
        {pending ? 'Triggering…' : 'Resync now'}
      </button>
      {status && (
        <p
          style={{
            margin: '0.6rem 0 0 0',
            fontSize: '0.9rem',
            color: status.ok ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

export function CatalogRebuildButton({ currentSize }: { currentSize: number }) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setStatus(null);
            const res = await rebuildExerciseCatalog();
            setStatus(res);
          })
        }
        style={primaryButton(pending)}
      >
        {pending ? 'Triggering…' : currentSize > 0 ? 'Rebuild catalog' : 'Bootstrap catalog'}
      </button>
      <p style={{ margin: '0.6rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Catalog currently has{' '}
        <span style={{ fontWeight: 600 }}>{currentSize.toLocaleString()}</span> exercises.
      </p>
      {status && (
        <p
          style={{
            margin: '0.4rem 0 0 0',
            fontSize: '0.9rem',
            color: status.ok ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

export function InviteForm() {
  const [result, action] = useFormState<InviteResult | null, FormData>(inviteUser, null);
  return (
    <form action={action} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <input
        type="email"
        name="email"
        required
        placeholder="family@example.com"
        maxLength={320}
        style={{
          flex: 1,
          minWidth: '220px',
          padding: '0.55rem 0.75rem',
          fontSize: '0.95rem',
          border: '1px solid var(--border-strong)',
          borderRadius: '6px',
        }}
      />
      <InviteSubmit />
      {result && (
        <p
          style={{
            width: '100%',
            margin: '0.4rem 0 0 0',
            fontSize: '0.9rem',
            color: result.ok ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}

function InviteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={primaryButton(pending)}>
      {pending ? 'Inviting…' : 'Invite'}
    </button>
  );
}

function primaryButton(pending: boolean): React.CSSProperties {
  return {
    padding: '0.55rem 1.1rem',
    background: pending ? 'var(--accent-soft)' : 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: pending ? 'wait' : 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  };
}

/**
 * Toggle a user's `Enabled` flag — reversible suspend. Used as a low-risk
 * alternative to a full delete. Disabled users can't sign in but their
 * data and credentials are preserved.
 */
export function UserEnabledToggle({
  username,
  enabled,
  isSelf,
}: {
  username: string;
  enabled: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (isSelf) {
    return (
      <span style={{ color: 'var(--text-faint)', fontSize: '0.78rem', fontStyle: 'italic' }}>
        (you)
      </span>
    );
  }
  const onClick = () => {
    const verb = enabled ? 'disable' : 'enable';
    if (!confirm(`${verb[0]!.toUpperCase() + verb.slice(1)} ${username.slice(0, 8)}…?`)) return;
    startTransition(async () => {
      setError(null);
      const res = await setUserEnabled(username, !enabled);
      if (res.ok) window.location.reload();
      else setError(res.message);
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button type="button" onClick={onClick} disabled={pending} style={smallButton(pending)}>
        {pending ? '…' : enabled ? 'Disable' : 'Enable'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{error}</span>}
    </div>
  );
}

/**
 * Hard-delete a user: removes the Cognito user + their Speediance secret +
 * their Profile row. Workout history rows are intentionally left in place
 * (cheap to keep at family scale; document/admin can clean them up later
 * if needed).
 *
 * Gated behind a typed-confirmation prompt so an accidental click can't
 * wipe a family member. The prompt asks for the first 8 chars of the
 * user's id — same scheme other admin tools use for "really mean it".
 */
export function HardDeleteUserButton({
  username,
  email,
  isSelf,
}: {
  username: string;
  email: string | undefined;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (isSelf) return null;
  const onClick = () => {
    const expected = username.slice(0, 8);
    const typed = prompt(
      `HARD DELETE — irreversible.\n\nThis removes the Cognito user, their Speediance secret, and their profile row. Workout history rows in DynamoDB are NOT deleted.\n\nTo confirm, type the first 8 chars of their user id: ${expected}`,
    );
    if (typed?.trim() !== expected) {
      if (typed !== null) alert('Mismatched id — aborted.');
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await hardDeleteUser(username);
      if (res.ok) {
        alert(res.message);
        window.location.reload();
      } else {
        setError(res.message);
      }
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          ...smallButton(pending),
          background: 'var(--bg-card)',
          color: 'var(--danger)',
          border: '1px solid #fecaca',
        }}
        title={`Hard delete ${email ?? username}`}
      >
        {pending ? '…' : 'Delete'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{error}</span>}
    </div>
  );
}

function smallButton(pending: boolean): React.CSSProperties {
  return {
    padding: '0.3rem 0.7rem',
    background: pending ? 'var(--border)' : 'var(--bg-subtle)',
    color: 'var(--text)',
    border: '1px solid var(--border-strong)',
    borderRadius: '5px',
    cursor: pending ? 'wait' : 'pointer',
    fontWeight: 500,
    fontSize: '0.82rem',
  };
}
