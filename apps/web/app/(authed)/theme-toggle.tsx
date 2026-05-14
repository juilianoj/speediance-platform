'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const COOKIE_NAME = 'spd-theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

function readCookie(): Theme | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.split('=')[1];
  return value === 'dark' || value === 'light' ? value : null;
}

function writeCookie(theme: Theme) {
  // Long-lived; SameSite=Lax so the cookie travels with normal navigation
  // but not with cross-site requests. No need for Secure here because the
  // value isn't sensitive — it's a UI preference.
  document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  writeCookie(theme);
}

function readDomTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Sun / moon toggle in the nav. The actual data-theme attribute is set
 * server-side by `RootLayout` reading the cookie — this component just
 * needs to flip it on click and persist the choice for the next request.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readDomTheme());
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

/**
 * One-shot client component that fires once after first paint: if the
 * user has no theme cookie AND their OS prefers dark, write the cookie
 * + flip data-theme so subsequent navigations stay dark.
 *
 * Rendered alongside `<ThemeToggle>` in the Nav. Returns null — it has
 * no visual presence.
 */
export function ThemePrefDetector() {
  useEffect(() => {
    if (readCookie() !== null) return; // user has already chosen
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) applyTheme('dark');
  }, []);
  return null;
}
