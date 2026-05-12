'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { setCardioHidden } from '@/lib/profile/actions';

export function HideCardioButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        startTransition(async () => {
          await setCardioHidden(true);
          // Profile flag changed — go home; the nav will refresh without
          // the Cardio link.
          router.push('/dashboard');
          router.refresh();
        });
      }}
      disabled={pending}
      style={{
        padding: '0.55rem 1rem',
        fontSize: '0.9rem',
        fontWeight: 600,
        background: '#fff',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Hiding…' : 'Hide cardio section'}
    </button>
  );
}
