/**
 * Stylized front-view human figure for the muscle-balance page. Each
 * major region is its own SVG path so we can color it by training
 * emphasis — more darkly saturated for muscle groups the user works
 * hard, faded for the neglected ones.
 *
 * Two variants per gender (traditional norms). They share the same
 * arm/leg skeleton — only the upper-body proportions differ — so the
 * figure stays recognisable from either side of the toggle:
 *   - male: broad shoulders, pec block, ab segmentation, narrow hips
 *   - female: narrower shoulders, single soft bust shape in place of
 *     pecs, slight waist taper, slightly wider hips, no ab segmentation
 *
 * No hair shape: the previous attempts (sweeping helmet, side tufts)
 * looked worse than nothing. The body proportions are gendered enough.
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

        {/* Head — same size for both variants; gender reads from the body */}
        <ellipse
          cx={110}
          cy={42}
          rx={24}
          ry={28}
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Neck */}
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
 * Female variant — same arm/leg skeleton as MaleBody so the figure reads
 * the same from either side of the toggle. Differences:
 *   - Shoulders narrower (66..154 vs male 56..164)
 *   - Pec block replaced with a single rounded bust shape
 *   - No ab segmentation lines
 *   - Waist taper at the bottom of the core (subtle hourglass)
 *   - Hip patch slightly wider for a feminine curve
 */
function FemaleBody({ fill, stroke, strokeW }: BodyVariantProps) {
  return (
    <>
      {/* Trapezius / upper neck — small slivers */}
      <path
        d="M 96 84 Q 90 92 84 100 L 96 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.6}
      />
      <path
        d="M 124 84 Q 130 92 136 100 L 124 96 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.6}
      />

      {/* Shoulders (delts) — narrower than male's */}
      <path
        d="M 84 100 Q 70 104 66 124 Q 70 132 80 130 Q 88 118 90 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 136 100 Q 150 104 154 124 Q 150 132 140 130 Q 132 118 130 104 Z"
        fill={fill('shoulders')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Bust — single rounded shape replacing the male pec block. Two soft
          lower-edge dips suggest mounds without being explicit, and a faint
          centerline hints at cleavage. */}
      <path
        d="M 86 102
           Q 78 120 80 152
           Q 96 164 110 158
           Q 124 164 140 152
           Q 142 120 134 102
           Q 124 116 110 116
           Q 96 116 86 102 Z"
        fill={fill('chest')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path d="M 110 118 L 110 156" stroke="rgba(15,23,42,0.18)" strokeWidth={0.9} fill="none" />

      {/* Upper arms — same position and shape as male */}
      <path
        d="M 66 124 Q 56 158 60 196 Q 74 200 80 196 Q 84 158 84 130 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 154 124 Q 164 158 160 196 Q 146 200 140 196 Q 136 158 136 130 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Forearms */}
      <path
        d="M 60 196 Q 56 232 62 268 Q 70 272 78 268 Q 82 232 80 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />
      <path
        d="M 160 196 Q 164 232 158 268 Q 150 272 142 268 Q 138 232 140 196 Z"
        fill={fill('arms')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.92}
      />

      {/* Lats slivers — between arm and torso */}
      <path
        d="M 84 130 Q 80 150 86 180 L 88 168 Q 86 150 86 130 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      <path
        d="M 136 130 Q 140 150 134 180 L 132 168 Q 134 150 134 130 Z"
        fill={fill('back')}
        stroke={stroke}
        strokeWidth={strokeW}
      />

      {/* Core / abs — wide top, tapered to a narrow waist. No segmentation. */}
      <path
        d="M 84 168
           Q 96 174 110 174 Q 124 174 136 168
           L 130 220 Q 120 240 110 240 Q 100 240 90 220 Z"
        fill={fill('core')}
        stroke={stroke}
        strokeWidth={strokeW}
      />
      {/* Belly-button hint */}
      <circle cx={110} cy={210} r={1.6} fill="rgba(15,23,42,0.22)" />

      {/* Hip transition — slightly wider than male (signature curve) but
          still well inside the figure width so it doesn't look like a skirt */}
      <path
        d="M 90 232 Q 110 242 130 232 L 144 268 L 76 268 Z"
        fill={fill('legs')}
        stroke={stroke}
        strokeWidth={strokeW}
        opacity={0.82}
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
