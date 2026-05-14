'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'spd-theme';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage can throw in private-browsing modes; ignore — the
    // bootstrap script falls back to system preference next paint.
  }
}

/**
 * Compact light/dark toggle. The initial theme is set by the inline
 * script in `layout.tsx` before React hydrates, so this component only
 * needs to handle clicks and keep its own visible state in sync.
 *
 * Renders a sun/moon glyph rather than text so it fits the existing
 * Nav alongside the user-menu chip.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      style={{
        background: 'transparent',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-muted)',
        borderRadius: '8px',
        width: '32px',
        height: '32px',
        padding: 0,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem',
        lineHeight: 1,
      }}
    >
      {isDark ? '☀' : '☾'}
    </button>
  );
}
