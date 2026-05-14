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
 * Default is `dark`. The cookie value `'light'` is the only opt-out —
 * once a user toggles to light, the cookie sticks for a year and
 * carries them across sessions. New visitors land in dark.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = stored === 'light' ? 'light' : 'dark';

  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
