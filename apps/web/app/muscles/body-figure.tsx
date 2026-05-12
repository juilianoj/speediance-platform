/**
 * Stylized front-view human figure for the muscle-balance page. Each
 * major region is its own SVG path so we can color it by training
 * emphasis — more darkly saturated for muscle groups the user works
 * hard, faded for the neglected ones.
 *
 * Renders a different silhouette per `gender` prop (traditional norms —
 * the male variant has broad shoulders + narrow hips + visible abs
 * segmentation; the female variant has narrower shoulders, hourglass
 * waist, flared hips, and a bust line in place of the pec block).
 * When gender is omitted we render the male variant (neutral-ish — the
 * original look).
 */
import type { MuscleGroupSets } from '@/app/dashboard/load-dashboard';

interface Props {
  sets: MuscleGroupSets;
  width?: number;
  gender?: 'male' | 'female';
}

const GROUPS = ['chest', 'shoulders', 'back', 'arms', 'legs', 'core'] as const;
type Group = (typeof GROUPS)[number];

const LABELS: Record<Group, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

export function BodyFigure({ sets, width = 240, gender = 'male' }: Props) {
  const max = Math.max(1, ...GROUPS.map((g) => sets[g] ?? 0));

  const fill = (g: Group): string => {
    const v = sets[g] ?? 0;
    if (v === 0) return '#eef2f7';
    const t = v / max;
    // Light tint → deep blue. Keeps recognisably different from untrained
    // grey for a single-set group.
    const r = Math.round(180 + (11 - 180) * t);
    const G = Math.round(220 + (120 - 220) * t);
    const b = Math.round(245 + (209 - 245) * t);
    return `rgb(${r},${G},${b})`;
  };

  const W = 220;
  const H = 480;
  const STROKE = 'rgba(15,23,42,0.22)';
  const STROKE_W = 1;
  const isFemale = gender === 'female';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
      <svg
        width={width}
        height={(width * H) / W}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Muscle group focus figure"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="depth" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(15,23,42,0.04)" />
            <stop offset="50%" stopColor="rgba(15,23,42,0)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.04)" />
          </linearGradient>
        </defs>

        {/* Head + neck — female has slightly smaller head & longer hair hint */}
        <ellipse
          cx={110}
          cy={42}
          rx={isFemale ? 22 : 24}
          ry={isFemale ? 26 : 28}
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        {isFemale && (
          // Hair: subtle shoulder-length silhouette behind the head/neck
          <path
            d="M 86 42 Q 86 86 96 102 L 124 102 Q 134 86 134 42 Q 134 18 110 18 Q 86 18 86 42 Z"
            fill="rgba(120,130,150,0.18)"
            stroke="none"
          />
        )}
        <path
          d="M 96 68 Q 110 82 124 68 L 124 84 Q 110 90 96 84 Z"
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {isFemale ? (
          <FemaleBody fill={fill} stroke={STROKE} strokeW={STROKE_W} />
        ) : (
          <MaleBody fill={fill} stroke={STROKE} strokeW={STROKE_W} />
        )}

        {/* Subtle left/right body shading */}
        <rect x={0} y={0} width={W} height={H} fill="url(#depth)" pointerEvents="none" />
      </svg>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.4rem 0.6rem',
          width: '100%',
          maxWidth: 280,
        }}
      >
        {GROUPS.map((g) => (
          <div
            key={g}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: fill(g),
                border: '1px solid rgba(15,23,42,0.1)',
                borderRadius: 3,
                flex: '0 0 auto',
              }}
            />
            <span style={{ color: '#64748b' }}>{LABELS[g]}</span>
            <span style={{ marginLeft: 'auto', color: '#0f172a', fontWeight: 600 }}>
              {sets[g] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BodyVariantProps {
  fill: (g: Group) => string;
  stroke: string;
  strokeW: number;
}

/**
 * Broad-shouldered, narrow-hipped silhouette with visible pec block and
 * subtle ab segmentation lines.
 */
function MaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Trapezius / upper neck — small triangles connecting neck to shoulders */}
      <path
        d="M 96 84 Q 88 92 78 100 L 96 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.65}
      />
      <path
        d="M 124 84 Q 132 92 142 100 L 124 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.65}
      />

      {/* Shoulders (delts) — wide rounded caps */}
      <path
        d="M 78 100 Q 60 102 56 124 Q 60 132 74 130 Q 84 118 88 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 142 100 Q 160 102 164 124 Q 160 132 146 130 Q 136 118 132 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Pectorals — symmetric block with cleavage gap */}
      <path
        d="M 88 100 Q 76 110 78 152 Q 96 168 108 162 Q 110 142 108 102 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 132 100 Q 144 110 142 152 Q 124 168 112 162 Q 110 142 112 102 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Upper arms (biceps) */}
      <path
        d="M 56 124 Q 46 158 50 196 Q 64 200 70 196 Q 74 158 74 130 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 164 124 Q 174 158 170 196 Q 156 200 150 196 Q 146 158 146 130 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Forearms */}
      <path
        d="M 50 196 Q 46 232 52 268 Q 60 272 68 268 Q 72 232 70 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
      <path
        d="M 170 196 Q 174 232 168 268 Q 160 272 152 268 Q 148 232 150 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />

      {/* Abs / core — rectangular block with segmentation */}
      <path
        d="M 80 168 Q 92 174 110 174 Q 128 174 140 168 L 144 244 Q 128 260 110 260 Q 92 260 76 244 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <g stroke="rgba(15,23,42,0.18)" strokeWidth={0.8} fill="none">
        <line x1={110} y1={178} x2={110} y2={252} />
        <line x1={84} y1={196} x2={136} y2={196} />
        <line x1={82} y1={216} x2={138} y2={216} />
        <line x1={80} y1={236} x2={140} y2={236} />
      </g>

      {/* Lats (back) — slivers between arm and core */}
      <path
        d="M 74 130 Q 70 150 78 180 L 80 168 Q 78 150 78 130 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 146 130 Q 150 150 142 180 L 140 168 Q 142 150 142 130 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Hips / glute-tie-in — narrow transition */}
      <path
        d="M 76 244 Q 110 260 144 244 L 150 268 Q 110 280 70 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.78}
      />

      {/* Quads */}
      <path
        d="M 80 268 Q 76 340 90 388 L 108 388 Q 112 340 108 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 140 268 Q 144 340 130 388 L 112 388 Q 108 340 112 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Calves */}
      <path
        d="M 90 388 Q 88 422 94 452 L 108 452 Q 110 422 108 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
      <path
        d="M 130 388 Q 132 422 126 452 L 112 452 Q 110 422 112 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
    </>
  );
}

/**
 * Narrow-shouldered, hourglass silhouette. Pectoral block replaced with a
 * single soft bust curve. Wider hips, flared quads, no ab-segmentation
 * lines.
 */
function FemaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Trap slivers — narrower than male */}
      <path
        d="M 96 84 Q 90 92 84 100 L 96 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.55}
      />
      <path
        d="M 124 84 Q 130 92 136 100 L 124 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.55}
      />

      {/* Shoulders (delts) — narrower, softer caps */}
      <path
        d="M 84 100 Q 70 104 68 122 Q 72 130 82 128 Q 90 118 92 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 136 100 Q 150 104 152 122 Q 148 130 138 128 Q 130 118 128 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Bust line — single soft curve across the upper torso, two gentle
          mounds either side of midline. Uses the 'chest' colour so it
          shades with chest training. */}
      <path
        d="M 92 104 Q 80 120 82 150 Q 96 162 110 158 Q 124 162 138 150 Q 140 120 128 104 Q 124 122 110 122 Q 96 122 92 104 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Subtle underbust shading for definition */}
      <path
        d="M 90 138 Q 100 154 110 152 Q 120 154 130 138"
        fill="none"
        stroke="rgba(15,23,42,0.18)"
        strokeWidth={0.8}
      />

      {/* Upper arms — slimmer than male variant */}
      <path
        d="M 68 122 Q 62 158 64 198 Q 76 202 80 198 Q 82 158 82 128 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 152 122 Q 158 158 156 198 Q 144 202 140 198 Q 138 158 138 128 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Forearms */}
      <path
        d="M 64 198 Q 60 232 64 266 Q 72 270 80 266 Q 82 232 80 198 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
      <path
        d="M 156 198 Q 160 232 156 266 Q 148 270 140 266 Q 138 232 140 198 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />

      {/* Core — hourglass: pinches narrow at the waist, no segmentation lines */}
      <path
        d="M 88 162 Q 100 168 110 168 Q 120 168 132 162 L 124 230 Q 110 240 96 230 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Soft midline shading */}
      <line x1={110} y1={172} x2={110} y2={228} stroke="rgba(15,23,42,0.12)" strokeWidth={0.8} />

      {/* Obliques (also part of core but rendered at lower opacity to keep
          the silhouette readable) */}

      {/* Lats — slivers next to the upper arm, narrower than male */}
      <path
        d="M 82 128 Q 80 150 88 178 L 88 162 Q 86 148 86 128 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 138 128 Q 140 150 132 178 L 132 162 Q 134 148 134 128 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Hips — flared wider than the shoulders for hourglass effect */}
      <path
        d="M 96 230 Q 110 240 124 230 L 156 268 Q 110 286 64 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />

      {/* Quads — slight outward flare at the top */}
      <path
        d="M 70 268 Q 66 340 86 392 L 108 392 Q 112 340 108 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 150 268 Q 154 340 134 392 L 112 392 Q 108 340 112 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Calves */}
      <path
        d="M 86 392 Q 84 424 92 454 L 108 454 Q 110 424 108 392 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
      <path
        d="M 134 392 Q 136 424 128 454 L 112 454 Q 110 424 112 392 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
    </>
  );
}
