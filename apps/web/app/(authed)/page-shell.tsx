/**
 * Shared layout shell for authed pages. Renders Nav + main wrapper so the
 * per-page files just contain content. Exposes a set of shared style
 * objects to keep the visual language consistent across pages.
 */
import type { ReactNode } from 'react';

import { Nav } from './nav';

export function PageShell({
  current,
  userLabel,
  title,
  children,
}: {
  current: Parameters<typeof Nav>[0]['current'];
  userLabel: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={pageWrapStyle}>
      <Nav current={current} userLabel={userLabel} />
      <main style={mainStyle}>
        <h1 style={h1Style}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

const pageWrapStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #f5f8fc 0%, #f7f8fa 280px)',
  minHeight: '100vh',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  color: '#0f172a',
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
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  background: '#fff',
  marginBottom: '1.25rem',
  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
};

export const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

export const mutedStyle: React.CSSProperties = {
  margin: '0.2rem 0 0 0',
  color: '#94a3b8',
  fontSize: '0.85rem',
};

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

export const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: '#64748b',
  fontWeight: 600,
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
};

export const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
  borderTop: '1px solid #f1f5f9',
};
