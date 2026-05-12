/**
 * Shared layout shell for authed pages. Renders the Nav + main wrapper so
 * the per-page files just contain content. The verifyIdTokenFromCookies()
 * call still happens in each page (Next.js redirects can't be inside a
 * shared async component without the route-group `layout.tsx` pattern,
 * which conflicts with the existing /dashboard, /profile layouts).
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
    <div
      style={{
        background: '#f7f8fa',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <Nav current={current} userLabel={userLabel} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem 3rem' }}>
        <h1 style={{ margin: '0 0 1.25rem 0', fontSize: '1.5rem' }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export const cardStyle: React.CSSProperties = {
  padding: '1.4rem 1.5rem',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  background: '#fff',
  marginBottom: '1.25rem',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};

export const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 600,
};

export const mutedStyle: React.CSSProperties = {
  margin: '0.15rem 0 0 0',
  color: '#888',
  fontSize: '0.85rem',
};

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

export const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  color: '#666',
  fontWeight: 500,
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
};

export const tdStyle: React.CSSProperties = {
  padding: '0.65rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
  borderTop: '1px solid #f1f1f1',
};
