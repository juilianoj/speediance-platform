'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface MobileItem {
  key: string;
  label: string;
  href: string;
}

/**
 * Mobile-only collapsed nav. Renders a hamburger button that toggles a
 * dropdown panel underneath the header containing the same items the
 * desktop inline nav shows. Visibility is controlled in globals.css via
 * `.nav-mobile-root` + `@media (max-width: 640px)` — on wide screens
 * the component renders nothing visible.
 *
 * Closes on Escape, outside click, and route change (Link components
 * default to client-side nav so we listen for state changes via the
 * onClick wrapper rather than wiring usePathname).
 */
export function NavMobile({ items, current }: { items: MobileItem[]; current: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.nav-mobile-root')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <div className="nav-mobile-root" style={rootStyle}>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </>
          )}
        </svg>
      </button>
      {open && (
        <div role="menu" style={panelStyle}>
          {items.map((i) => (
            <Link
              key={i.key}
              href={i.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                ...itemStyle,
                color: current === i.key ? 'var(--accent)' : 'var(--text)',
                background: current === i.key ? 'var(--accent-soft)' : 'transparent',
                fontWeight: current === i.key ? 600 : 500,
              }}
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  position: 'relative',
  display: 'none',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  padding: 0,
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  cursor: 'pointer',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  minWidth: '180px',
  padding: '0.4rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
  zIndex: 30,
};

const itemStyle: React.CSSProperties = {
  padding: '0.55rem 0.8rem',
  borderRadius: '8px',
  fontSize: '0.95rem',
  textDecoration: 'none',
  transition: 'background 120ms',
};
