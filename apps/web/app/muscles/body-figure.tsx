/**
 * Stylized front-view human figure for the muscle-balance page. Each
 * major region is its own SVG path so we can color it by training
 * emphasis — more darkly saturated for muscle groups the user works
 * hard, faded for the neglected ones.
 *
 * Two variants per gender (traditional norms):
 *   - male: broad-shouldered, narrow-waisted, narrow-hipped, visible
 *     pec block + ab segmentation.
 *   - female: narrower shoulders, hourglass with pinched waist and
 *     hips wider than shoulders, two soft bust mounds, no ab
 *     segmentation, short hair tucked behind the head.
 *
 * When gender is omitted we render the male variant.
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

        {/* Hair (female only) — short, sits behind the head and barely
            extends past the jaw. Two small wisps tuck under the ears. No
            sweeping helmet that swallowed the figure last time. */}
        {isFemale && (
          <path
            d="M 88 36 Q 84 60 90 80 Q 96 72 96 60 Q 96 30 110 26 Q 124 30 124 60 Q 124 72 130 80 Q 136 60 132 36 Q 124 16 110 16 Q 96 16 88 36 Z"
            fill="rgba(80,90,110,0.55)"
            stroke="rgba(15,23,42,0.2)"
            strokeWidth={STROKE_W}
          />
        )}

        {/* Head */}
        <ellipse
          cx={110}
          cy={42}
          rx={isFemale ? 18 : 24}
          ry={isFemale ? 22 : 28}
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Neck — narrower for female */}
        <path
          d={
            isFemale
              ? 'M 104 64 Q 110 74 116 64 L 116 88 Q 110 92 104 88 Z'
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
 * ab segmentation. Hip patch tapers inward (no skirt flare).
 */
function MaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Trapezius / upper neck */}
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

      {/* Pectorals */}
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

      {/* Upper arms */}
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

      {/* Abs / core */}
      <path
        d="M 80 168 Q 92 174 110 174 Q 128 174 140 168 L 140 244 Q 124 254 110 254 Q 96 254 80 244 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <g stroke="rgba(15,23,42,0.18)" strokeWidth={0.8} fill="none">
        <line x1={110} y1={178} x2={110} y2={250} />
        <line x1={84} y1={196} x2={136} y2={196} />
        <line x1={82} y1={216} x2={138} y2={216} />
        <line x1={82} y1={236} x2={138} y2={236} />
      </g>

      {/* Lats */}
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

      {/* Hip transition — tapers INWARD from abs to quad-tops, no flare */}
      <path
        d="M 80 244 Q 110 254 140 244 L 138 268 L 82 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.78}
      />

      {/* Quads */}
      <path
        d="M 82 268 Q 78 340 92 388 L 108 388 Q 112 340 108 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 138 268 Q 142 340 128 388 L 112 388 Q 108 340 112 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Calves */}
      <path
        d="M 92 388 Q 88 422 96 452 L 108 452 Q 110 422 108 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
      <path
        d="M 128 388 Q 132 422 124 452 L 112 452 Q 110 422 112 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
    </>
  );
}

/**
 * Female silhouette — clean version.
 *
 * Geometry landmarks (220×480 viewBox):
 *   Shoulders   y=92..108, x=88..132  (44 wide)
 *   Bust        y=110..156, x=90..130
 *   Waist       y=180..200, x=100..120 (pinched)
 *   Hips        y=225..268, x=78..142 (wider than shoulders)
 *   Quads       y=268..388
 *   Calves      y=388..452
 *
 * Arms sit BESIDE the torso (x outside the body) and end at hip level.
 */
function FemaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Shoulders — small soft caps */}
      <ellipse
        cx={94}
        cy={104}
        rx={10}
        ry={10}
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <ellipse
        cx={126}
        cy={104}
        rx={10}
        ry={10}
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Bust — one rounded shape with a soft cleavage indent at top.
          Two slight bumps on the lower edge suggest mounds without being
          explicit. */}
      <path
        d="M 90 110 Q 88 130 94 150 Q 102 158 110 154 Q 118 158 126 150 Q 132 130 130 110 Q 120 116 110 116 Q 100 116 90 110 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Cleavage hint */}
      <path d="M 110 118 L 110 152" stroke="rgba(15,23,42,0.18)" strokeWidth={0.9} fill="none" />

      {/* Lats — tiny slivers behind the upper arms */}
      <path
        d="M 90 120 Q 88 144 92 168 L 96 158 Q 94 142 94 122 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 130 120 Q 132 144 128 168 L 124 158 Q 126 142 126 122 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Core / waist — hourglass: starts at bust width, pinches dramatically
          at the waist (~y=190), flares back at the hips. */}
      <path
        d="M 94 154
           Q 110 162 126 154
           L 122 184 Q 122 196 118 220 L 114 232
           L 106 232 Q 102 220 102 196 L 98 184 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Belly-button hint */}
      <circle cx={110} cy={210} r={1.6} fill="rgba(15,23,42,0.22)" />

      {/* Hips — flare wider than shoulders, signature hourglass */}
      <path
        d="M 102 226 Q 110 234 118 226 L 142 268 L 78 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />

      {/* Quads — slight outward flare at the top */}
      <path
        d="M 82 268 Q 78 336 92 388 L 108 388 Q 112 336 108 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 138 268 Q 142 336 128 388 L 112 388 Q 108 336 112 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Calves */}
      <path
        d="M 92 388 Q 88 422 96 452 L 108 452 Q 110 422 108 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />
      <path
        d="M 128 388 Q 132 422 124 452 L 112 452 Q 110 422 112 388 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.85}
      />

      {/* Arms — slim, BESIDE the body, ending at hip level (y≈268). Drawn
          after the body so they sit on top of the lats but don't overshoot. */}
      <path
        d="M 84 108 Q 78 150 80 196 Q 86 200 92 196 Q 94 150 94 116 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 136 108 Q 142 150 140 196 Q 134 200 128 196 Q 126 150 126 116 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Forearms */}
      <path
        d="M 80 196 Q 76 230 80 264 Q 86 268 92 264 Q 94 230 92 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
      <path
        d="M 140 196 Q 144 230 140 264 Q 134 268 128 264 Q 126 230 128 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
    </>
  );
}
