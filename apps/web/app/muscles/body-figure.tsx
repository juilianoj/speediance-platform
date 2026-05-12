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

        {/* Hair — rendered BEHIND the head so the face shows through. Flows
            past the jawline and down to the shoulders for an obvious "female"
            silhouette read at a glance. */}
        {isFemale && (
          <path
            d="M 78 36 Q 70 70 76 110 Q 86 130 96 120 Q 90 100 90 60 Q 90 40 110 30 Q 130 40 130 60 Q 130 100 124 120 Q 134 130 144 110 Q 150 70 142 36 Q 134 14 110 14 Q 86 14 78 36 Z"
            fill="rgba(60,70,90,0.55)"
            stroke="rgba(15,23,42,0.18)"
            strokeWidth={STROKE_W}
          />
        )}
        {/* Head */}
        <ellipse
          cx={110}
          cy={42}
          rx={isFemale ? 20 : 24}
          ry={isFemale ? 24 : 28}
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        {/* Neck — narrower for female */}
        <path
          d={
            isFemale
              ? 'M 102 66 Q 110 78 118 66 L 118 86 Q 110 92 102 86 Z'
              : 'M 96 68 Q 110 82 124 68 L 124 84 Q 110 90 96 84 Z'
          }
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
 * Female silhouette: distinctly narrower shoulders, pinched waist, hips
 * that flare WIDER than the shoulders (hourglass), two clear bust mounds
 * with a cleavage gap, and slim feminine arms/legs.
 *
 * Coordinate landmarks (viewBox 220×480):
 *   shoulder span 80..140 (vs male 56..164 — ~45% narrower)
 *   waist span   100..120 (very pinched)
 *   hip span      60..160 (wider than shoulders)
 */
function FemaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Shoulders (delts) — small soft caps, much narrower than male */}
      <path
        d="M 88 96 Q 78 100 80 118 Q 86 124 94 122 Q 100 112 102 98 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 132 96 Q 142 100 140 118 Q 134 124 126 122 Q 120 112 118 98 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Bust — two distinct mounds with a clear cleavage gap, sitting
          higher on the torso than the male pec block. */}
      <path
        d="M 96 110 Q 84 118 88 144 Q 100 156 108 150 Q 110 138 108 112 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 124 110 Q 136 118 132 144 Q 120 156 112 150 Q 110 138 112 112 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Nipple/bust highlight — small soft dots */}
      <circle cx={96} cy={138} r={2} fill="rgba(15,23,42,0.25)" />
      <circle cx={124} cy={138} r={2} fill="rgba(15,23,42,0.25)" />

      {/* Upper arms — slim, hugging the body */}
      <path
        d="M 80 118 Q 72 154 74 196 Q 84 200 90 196 Q 92 154 92 122 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 140 118 Q 148 154 146 196 Q 136 200 130 196 Q 128 154 128 122 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Forearms */}
      <path
        d="M 74 196 Q 70 230 74 266 Q 82 270 90 266 Q 92 230 90 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
      <path
        d="M 146 196 Q 150 230 146 266 Q 138 270 130 266 Q 128 230 130 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />

      {/* Core — clear hourglass: shoulders wide-ish at top, pinches in
          dramatically at the waist, then flares back out at the hips. */}
      <path
        d="M 92 150 Q 102 160 110 160 Q 118 160 128 150
           Q 104 178 102 200 Q 100 220 110 232
           Q 120 220 118 200 Q 116 178 92 150 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Belly button hint */}
      <ellipse cx={110} cy={210} rx={1.5} ry={2.2} fill="rgba(15,23,42,0.2)" />

      {/* Lats — small slivers */}
      <path
        d="M 92 122 Q 88 146 96 174 L 96 154 Q 94 140 94 124 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 128 122 Q 132 146 124 174 L 124 154 Q 126 140 126 124 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Hips — DRAMATICALLY wider than shoulders. The signature hourglass
          flare. Goes from the pinched waist (~100..120) out to 60..160. */}
      <path
        d="M 100 226 Q 110 232 120 226
           Q 156 248 160 280
           Q 110 296 60 280
           Q 64 248 100 226 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />

      {/* Quads — flared outward at top (matching hip width), tapering to
          the knee */}
      <path
        d="M 64 280 Q 64 340 88 396 L 108 396 Q 112 340 108 280 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 156 280 Q 156 340 132 396 L 112 396 Q 108 340 112 280 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Calves — slim, slight outward curve mid-shin */}
      <path
        d="M 88 396 Q 84 422 92 456 L 108 456 Q 110 422 108 396 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
      <path
        d="M 132 396 Q 136 422 128 456 L 112 456 Q 110 422 112 396 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
    </>
  );
}
