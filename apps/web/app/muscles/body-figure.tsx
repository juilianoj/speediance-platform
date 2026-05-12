/**
 * Stylized front-view human figure for the muscle-balance page. Each
 * major region is its own SVG path so we can color it by training
 * emphasis — more darkly saturated for muscle groups the user works
 * hard, faded for the neglected ones. Aims for "anatomy diagram
 * silhouette" rather than the boxy first attempt.
 */
import type { MuscleGroupSets } from '@/app/dashboard/load-dashboard';

interface Props {
  sets: MuscleGroupSets;
  width?: number;
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

export function BodyFigure({ sets, width = 240 }: Props) {
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

        {/* Head + neck */}
        <ellipse
          cx={110}
          cy={42}
          rx={24}
          ry={28}
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 96 68 Q 110 82 124 68 L 124 84 Q 110 90 96 84 Z"
          fill="#eef2f7"
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Trapezius / upper neck — small triangles connecting neck to shoulders */}
        <path
          d="M 96 84 Q 88 92 78 100 L 96 96 Z"
          fill={fill('back')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.65}
        />
        <path
          d="M 124 84 Q 132 92 142 100 L 124 96 Z"
          fill={fill('back')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.65}
        />

        {/* Shoulders (delts) — rounded caps on both sides */}
        <path
          d="M 78 100 Q 60 102 56 124 Q 60 132 74 130 Q 84 118 88 104 Z"
          fill={fill('shoulders')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 142 100 Q 160 102 164 124 Q 160 132 146 130 Q 136 118 132 104 Z"
          fill={fill('shoulders')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Pectorals — symmetric, with a cleavage gap, curving under */}
        <path
          d="M 88 100 Q 76 110 78 152 Q 96 168 108 162 Q 110 142 108 102 Z"
          fill={fill('chest')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 132 100 Q 144 110 142 152 Q 124 168 112 162 Q 110 142 112 102 Z"
          fill={fill('chest')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Upper arms (biceps) — long curves hanging from the deltoids */}
        <path
          d="M 56 124 Q 46 158 50 196 Q 64 200 70 196 Q 74 158 74 130 Z"
          fill={fill('arms')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 164 124 Q 174 158 170 196 Q 156 200 150 196 Q 146 158 146 130 Z"
          fill={fill('arms')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Forearms — narrower extensions below the biceps */}
        <path
          d="M 50 196 Q 46 232 52 268 Q 60 272 68 268 Q 72 232 70 196 Z"
          fill={fill('arms')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.92}
        />
        <path
          d="M 170 196 Q 174 232 168 268 Q 160 272 152 268 Q 148 232 150 196 Z"
          fill={fill('arms')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.92}
        />

        {/* Abs / core — clear 6-pack rectangle plus tapering oblique sides */}
        <path
          d="M 80 168 Q 92 174 110 174 Q 128 174 140 168 L 144 244 Q 128 260 110 260 Q 92 260 76 244 Z"
          fill={fill('core')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        {/* Subtle abdominal segmentation lines, visible only when core is darker */}
        <g stroke="rgba(15,23,42,0.18)" strokeWidth={0.8} fill="none">
          <line x1={110} y1={178} x2={110} y2={252} />
          <line x1={84} y1={196} x2={136} y2={196} />
          <line x1={82} y1={216} x2={138} y2={216} />
          <line x1={80} y1={236} x2={140} y2={236} />
        </g>

        {/* Lats (back) — visible in the gap between arm and ribcage */}
        <path
          d="M 74 130 Q 70 150 78 180 L 80 168 Q 78 150 78 130 Z"
          fill={fill('back')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 146 130 Q 150 150 142 180 L 140 168 Q 142 150 142 130 Z"
          fill={fill('back')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Hips / glute-tie-in — narrow waist transition */}
        <path
          d="M 76 244 Q 110 260 144 244 L 150 268 Q 110 280 70 268 Z"
          fill={fill('legs')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.78}
        />

        {/* Quads (legs upper) — two tapered cones */}
        <path
          d="M 80 268 Q 76 340 90 388 L 108 388 Q 112 340 108 268 Z"
          fill={fill('legs')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />
        <path
          d="M 140 268 Q 144 340 130 388 L 112 388 Q 108 340 112 268 Z"
          fill={fill('legs')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
        />

        {/* Calves (lower legs) */}
        <path
          d="M 90 388 Q 88 422 94 452 L 108 452 Q 110 422 108 388 Z"
          fill={fill('legs')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.85}
        />
        <path
          d="M 130 388 Q 132 422 126 452 L 112 452 Q 110 422 112 388 Z"
          fill={fill('legs')}
          stroke={STROKE}
          strokeWidth={STROKE_W}
          opacity={0.85}
        />

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
