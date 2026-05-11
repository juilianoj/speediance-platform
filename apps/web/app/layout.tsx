import type { ReactNode } from 'react';

export const metadata = {
  title: 'speediance-platform',
  description: 'Self-hosted Speediance workout dashboard.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
