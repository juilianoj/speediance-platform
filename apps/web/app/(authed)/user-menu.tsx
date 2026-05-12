'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { signOut } from '@/lib/auth/actions';

interface MenuItem {
  label: string;
  href: string;
}

/**
 * User-menu dropdown rendered on the right side of the authed nav.
 * Replaces the old "email link + Sign out button" pair: one click target
 * showing an avatar + truncated email, opening a popover with Profile,
 * Feedback, Admin (always shown — admin is on the honor system today),
 * and Sign out.
 *
 * Click-outside / Escape closes the popover. Uses a small focus-trap-lite
 * pattern (no library) — fine at our scale.
 */
export function UserMenu({ email, items }: { email: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = email.trim().charAt(0).toUpperCase() || '?';
  // Display: just the local-part of the email so long addresses don't
  // dominate the nav. Tooltip has the full thing.
  const display = email.includes('@') ? email.split('@')[0]! : email;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={email}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          padding: '0.3rem 0.55rem 0.3rem 0.3rem',
          border: '1px solid #e5e7eb',
          borderRadius: '999px',
          background: open ? '#f8fafc' : '#ffffff',
          cursor: 'pointer',
          fontSize: '0.85rem',
          color: '#334155',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #22d3ee 0%, #0b78d1 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          {initial}
        </span>
        <span
          style={{
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {display}
        </span>
        <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.05)',
            padding: '0.35rem',
            zIndex: 30,
          }}
        >
          <div
            style={{
              padding: '0.5rem 0.65rem 0.55rem 0.65rem',
              fontSize: '0.78rem',
              color: '#94a3b8',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: '0.25rem',
              wordBreak: 'break-all',
            }}
          >
            {email}
          </div>
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={menuItemStyle}
            >
              {item.label}
            </a>
          ))}
          <form
            action={(formData: FormData) => {
              startTransition(async () => {
                void formData;
                await signOut();
              });
            }}
            style={{ margin: 0 }}
          >
            <button
              type="submit"
              disabled={pending}
              style={{
                ...menuItemStyle,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                color: '#dc2626',
                borderTop: '1px solid #f1f5f9',
                marginTop: '0.25rem',
                paddingTop: '0.55rem',
              }}
            >
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '0.5rem 0.65rem',
  borderRadius: '6px',
  fontSize: '0.88rem',
  color: '#0f172a',
  textDecoration: 'none',
  fontWeight: 500,
};
