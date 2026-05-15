import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import './globals.css';

// Resolved by Next when emitting absolute URLs in OG / twitter / canonical
// tags. Unfurlers like iMessage and Slack reject relative paths, so this
// has to be set somewhere — the root layout is the natural spot. Prod
// uses the live domain; everywhere else falls back to the dev CloudFront
// URL so /opengraph-image still resolves on PR previews.
const siteUrl =
  process.env.SST_STAGE === 'prod'
    ? 'https://gymmonsterfit.com'
    : 'https://d2wtidficpq5l9.cloudfront.net';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Gym Monster Fit',
  description:
    'Your self-hosted Speediance training dashboard — workout history, progression tracking, and an AI coach that builds your next session.',
  openGraph: {
    type: 'website',
    siteName: 'Gym Monster Fit',
    title: 'Gym Monster Fit',
    description:
      'Your self-hosted Speediance training dashboard — workout history, progression tracking, and an AI coach that builds your next session.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gym Monster Fit',
    description:
      'Your self-hosted Speediance training dashboard — workout history, progression tracking, and an AI coach that builds your next session.',
  },
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
