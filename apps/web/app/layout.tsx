import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'speediance-platform',
  description: 'Self-hosted Speediance workout dashboard.',
};

const THEME_COOKIE = 'spd-theme';

/**
 * Reads the user's theme preference from a cookie and applies it as
 * `data-theme` on `<html>` server-side. Because the attribute is part of
 * the server response, the page paints with the correct palette on the
 * very first frame — no flash-of-wrong-theme on slow loads or hard
 * reloads.
 *
 * Falls back to `light` when no cookie is set; the `ThemePrefDetector`
 * client component handles "user has never toggled but their OS prefers
 * dark" by setting the cookie on first mount.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = stored === 'dark' ? 'dark' : 'light';

  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
