import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'speediance-platform',
  description: 'Self-hosted Speediance workout dashboard.',
};

/**
 * Inline script that runs BEFORE React hydrates. Reads the stored theme
 * preference (or system default) and sets `data-theme` on <html> so the
 * page paints with the correct palette and there's no flash of light
 * background on first load.
 *
 * Kept as a string-injected <script> rather than a normal component
 * because React's hydration tree can't run before paint — this needs to
 * execute synchronously in the document head.
 */
const themeBootstrap = `
(function() {
  try {
    var stored = localStorage.getItem('spd-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
