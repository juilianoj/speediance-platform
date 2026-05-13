'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  inviteUser,
  rebuildExerciseCatalog,
  resyncMe,
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
            color: status.ok ? '#0d9488' : '#b91c1c',
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
      <p style={{ margin: '0.6rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
        Catalog currently has{' '}
        <span style={{ fontWeight: 600 }}>{currentSize.toLocaleString()}</span> exercises.
      </p>
      {status && (
        <p
          style={{
            margin: '0.4rem 0 0 0',
            fontSize: '0.9rem',
            color: status.ok ? '#0d9488' : '#b91c1c',
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
          border: '1px solid #d0d0d0',
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
            color: result.ok ? '#0d9488' : '#b91c1c',
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
    background: pending ? '#88b8e0' : '#0b78d1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: pending ? 'wait' : 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  };
}
