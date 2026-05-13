'use client';

import { useTransition } from 'react';

import { createDraft } from '@/lib/builder/actions';

/**
 * Kicks off `createDraft` — a server action that mints a new draft row
 * and redirects to its editor page. Wrapped in a client component so the
 * pending state shows up immediately.
 */
export function NewWorkoutButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          await createDraft();
        })
      }
      style={{
        padding: '0.6rem 1.1rem',
        background: disabled ? '#94a3b8' : '#0b78d1',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 600,
        fontSize: '0.92rem',
        cursor: disabled ? 'not-allowed' : pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Creating…' : 'New workout'}
    </button>
  );
}
