'use client';

import { useTransition } from 'react';

import { createDraft } from '@/lib/builder/actions';
import { createProgram } from '@/lib/builder/program-actions';

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
        background: disabled ? 'var(--text-faint)' : 'var(--accent)',
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

export function NewProgramButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          await createProgram();
        })
      }
      title={disabled ? 'Build at least one workout first.' : undefined}
      style={{
        padding: '0.6rem 1.1rem',
        background: disabled ? 'var(--text-faint)' : 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 600,
        fontSize: '0.92rem',
        cursor: disabled ? 'not-allowed' : pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Creating…' : 'New program'}
    </button>
  );
}
