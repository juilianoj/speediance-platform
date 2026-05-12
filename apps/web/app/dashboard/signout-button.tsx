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
          padding: '0.4rem 0.8rem',
          fontSize: '0.9rem',
          background: 'transparent',
          color: '#444',
          border: '1px solid #ccc',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </form>
  );
}
