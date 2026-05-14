/**
 * Shared layout shell for authed pages. Renders Nav + main wrapper so the
 * per-page files just contain content. Exposes a set of shared style
 * objects to keep the visual language consistent across pages.
 */
import type { ReactNode } from 'react';

import { AssistantDrawer } from './assistant-drawer';
import { Nav } from './nav';

export function PageShell({
  current,
  userLabel,
  title,
  children,
}: {
  current: Parameters<typeof Nav>[0]['current'];
  userLabel: string;
  /** Optional page header. Omit on static pages — the nav already shows
   *  which page you're on, and a redundant "Dashboard / Coach / Lift log"
   *  banner just takes up real estate. Pass it on dynamic pages where the
   *  title is real context (a date, a workout name, an exercise name). */
  title?: string;
  children: ReactNode;
}) {
  return (
    <div style={pageWrapStyle}>
      <Nav current={current} userLabel={userLabel} />
      <main style={mainStyle}>
        {title && <h1 style={h1Style}>{title}</h1>}
        {children}
      </main>
      <AssistantDrawer />
    </div>
  );
}

const pageWrapStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--bg-page-gradient-top) 0%, var(--bg-page) 280px)',
  minHeight: '100vh',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  color: 'var(--text)',
};

const mainStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '0 1.5rem 3rem',
};

const h1Style: React.CSSProperties = {
  margin: '0 0 1.25rem 0',
  fontSize: '1.75rem',
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

export const cardStyle: React.CSSProperties = {
  padding: '1.4rem 1.5rem',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--bg-card)',
  marginBottom: '1.25rem',
  boxShadow: 'var(--shadow-card)',
};

export const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
};

export const mutedStyle: React.CSSProperties = {
  margin: '0.2rem 0 0 0',
  color: 'var(--text-faint)',
  fontSize: '0.85rem',
};

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
  color: 'var(--text)',
};

export const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
};

export const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
  borderTop: '1px solid var(--border-faint)',
};
