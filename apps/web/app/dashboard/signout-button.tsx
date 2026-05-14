'use client';

import { useTransition } from 'react';

import { signOut } from '@/lib/auth/actions';

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData: FormData) => {
        // Wrap the Server Action in a transition so the button can show
        // pending state while Cognito's GlobalSignOut round-trips.
        startTransition(async () => {
          void formData;
          await signOut();
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '0.4rem 0.85rem',
          fontSize: '0.85rem',
          background: 'transparent',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        {pending ? '…' : 'Sign out'}
      </button>
    </form>
  );
}
