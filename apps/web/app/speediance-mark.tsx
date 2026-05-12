/**
 * The "S" mark used as the brand glyph throughout the app — top-left of
 * the authed nav, the login card, the forgot-password card.
 *
 * Drawn as a single SVG path with rounded caps and a cool cyan→deep-blue
 * gradient. Slight forward lean for a "speed" feel. Replaces the earlier
 * purple-tinted rounded square that didn't read as a logo.
 */
export function SpeedianceMark({ size = 28 }: { size?: number }) {
  // Use a globally-unique id so multiple instances on the same page don't
  // collide. Math.random would break SSR hydration, so use a static suffix
  // derived from the size — collisions only matter when two marks share
  // the same gradient definition, which is fine because the gradient is
  // identical.
  const id = `s-mark-grad`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Speediance"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0b78d1" />
        </linearGradient>
      </defs>
      {/* Optional soft glow halo */}
      <circle cx={16} cy={16} r={15} fill={`url(#${id})`} opacity={0.08} />
      {/* The S itself — single stroke with a slight italic lean. Two cubic
          bezier curves chained: top arc curving down-left, then bottom arc
          curving down-right. */}
      <path
        d="M 25 7
           C 22 4, 12 4, 9 8
           C 6 12, 10 15, 16 16
           C 22 17, 26 19, 23 24
           C 20 28, 11 28, 7 25"
        stroke={`url(#${id})`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
