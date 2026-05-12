'use client';

import { useState, useTransition } from 'react';

import { setMyMfa } from '@/lib/admin/actions';

export function MfaToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      setStatus(null);
      const target = !on;
      const res = await setMyMfa(target);
      setStatus(res);
      if (res.ok) setOn(target);
    });
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.95rem' }}>Two-factor sign-in</strong>
          <p style={{ margin: '0.3rem 0 0 0', color: '#666', fontSize: '0.85rem' }}>
            {on
              ? 'You scan a TOTP code at sign-in. Recommended even though training data is low-sensitivity.'
              : 'Sign-in is email + password only. Turn on if you share the account or just want the extra layer.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          style={{
            padding: '0.55rem 1.1rem',
            background: on ? '#dc2626' : '#0b78d1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: pending ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          {pending ? '…' : on ? 'Disable MFA' : 'Enable MFA'}
        </button>
      </div>
      {status && (
        <p
          style={{
            margin: '0.6rem 0 0 0',
            fontSize: '0.85rem',
            color: status.ok ? '#0d9488' : '#b91c1c',
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
