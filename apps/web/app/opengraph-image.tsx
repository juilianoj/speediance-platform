import { ImageResponse } from 'next/og';

/**
 * Open Graph image for link unfurls (iMessage, Slack, Twitter, WhatsApp,
 * Facebook, LinkedIn, etc). Next.js auto-emits the corresponding
 * `<meta property="og:image">` tag on the root layout because of the
 * filename convention.
 *
 * Rendered via Satori (next/og) — no static asset, no design tool. Edit
 * the JSX below to tweak the layout. The output is a 1200×630 PNG, the
 * canonical OG image size.
 */

export const alt = 'Gym Monster Fit — your self-hosted Speediance training dashboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '80px',
        background: 'linear-gradient(135deg, #0b0f15 0%, #0d1117 45%, #102234 100%)',
        fontFamily: 'system-ui, sans-serif',
        color: '#e6edf3',
      }}
    >
      {/* Brand row — gradient S-mark + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '28px',
            background: 'linear-gradient(135deg, #22d3ee 0%, #0ea5e9 55%, #0b78d1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '88px',
            fontWeight: 900,
            color: '#0b0f15',
            fontStyle: 'italic',
            boxShadow: '0 8px 32px rgba(11, 120, 209, 0.45)',
          }}
        >
          S
        </div>
        <div
          style={{
            fontSize: '44px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#8b949e',
          }}
        >
          gymmonsterfit.com
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div
          style={{
            fontSize: '116px',
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            color: '#f0f6fc',
            display: 'flex',
          }}
        >
          Gym Monster Fit
        </div>
        <div
          style={{
            fontSize: '40px',
            fontWeight: 500,
            lineHeight: 1.3,
            color: '#8b949e',
            display: 'flex',
            maxWidth: '900px',
          }}
        >
          Your self-hosted Speediance training dashboard — workout history, progression, and an AI
          coach that builds your next session.
        </div>
      </div>

      {/* Accent stripe at the bottom */}
      <div
        style={{
          height: '8px',
          width: '180px',
          borderRadius: '999px',
          background: 'linear-gradient(90deg, #22d3ee 0%, #0ea5e9 55%, #0b78d1 100%)',
        }}
      />
    </div>,
    { ...size },
  );
}
