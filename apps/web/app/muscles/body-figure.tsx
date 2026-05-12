/**
 * Stylized front-view human figure for the muscle-balance page. Each major
 * region is its own SVG path so we can color it by training emphasis: more
 * darkly saturated for muscle groups the user works hard, faded for the
 * neglected ones. Designed to be schematic, not anatomical — readable at
 * 240px wide.
 *
 * Region count matches our MuscleGroupSets keys: chest, shoulders, back,
 * arms, legs, core. Back lives behind the body in this front view, so we
 * render it as a small badge at the upper back / lats outline rather than
 * trying to draw a back view.
 */
import type { MuscleGroupSets } from '@/app/dashboard/load-dashboard';

interface Props {
  /** Set counts per group over the analysis window. */
  sets: MuscleGroupSets;
  /** Width in px; height scales 1:2.5 to keep the figure tall. */
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
  // Color intensity = sets / max-across-groups. So the most-trained group
  // gets the deepest blue and everything else scales relative to it.
  const max = Math.max(1, ...GROUPS.map((g) => sets[g] ?? 0));

  const fill = (g: Group): string => {
    const v = sets[g] ?? 0;
    if (v === 0) return '#e5e7eb'; // neutral grey — explicitly "untrained"
    const t = v / max; // 0..1
    // Interpolate between a light tint and a deep blue. Tint stays
    // recognisably different from the "untrained" grey so a 1-set group
    // still reads as worked.
    const r = Math.round(173 + (11 - 173) * t);
    const G = Math.round(216 + (120 - 216) * t);
    const b = Math.round(243 + (209 - 243) * t);
    return `rgb(${r},${G},${b})`;
  };

  // Coordinates in a 200×500 internal grid; scaled via viewBox.
  const W = 200;
  const H = 500;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <svg
        width={width}
        height={(width * H) / W}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Muscle group focus figure"
        style={{ display: 'block' }}
      >
        {/* Stroke colour for all body parts */}
        <defs>
          <linearGradient id="body-shade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(15,23,42,0.05)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0)" />
          </linearGradient>
        </defs>

        {/* Head */}
        <circle cx={100} cy={42} r={26} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1.2} />
        <ellipse
          cx={100}
          cy={73}
          rx={10}
          ry={5}
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth={1.2}
        />

        {/* Shoulders (delts) — two rounded blocks at the top of the torso */}
        <Region d={`M48 96 Q62 80 78 86 L86 116 Q72 122 56 116 Z`} fill={fill('shoulders')} />
        <Region d={`M152 96 Q138 80 122 86 L114 116 Q128 122 144 116 Z`} fill={fill('shoulders')} />

        {/* Chest (pectorals) — two pectoral blocks under the shoulders */}
        <Region d={`M64 114 L97 114 L97 178 Q80 184 64 174 Z`} fill={fill('chest')} />
        <Region d={`M136 114 L103 114 L103 178 Q120 184 136 174 Z`} fill={fill('chest')} />

        {/* Core (abs + obliques) — torso below pecs */}
        <Region d={`M70 180 L130 180 L128 270 Q100 280 72 270 Z`} fill={fill('core')} />

        {/* Arms (biceps + forearms) — long shapes down both sides */}
        <Region d={`M40 102 Q34 130 38 170 L52 178 Q56 140 56 110 Z`} fill={fill('arms')} />
        <Region d={`M52 178 L56 220 Q62 240 56 268 L42 270 Q38 240 38 200 Z`} fill={fill('arms')} />
        <Region d={`M160 102 Q166 130 162 170 L148 178 Q144 140 144 110 Z`} fill={fill('arms')} />
        <Region
          d={`M148 178 L144 220 Q138 240 144 268 L158 270 Q162 240 162 200 Z`}
          fill={fill('arms')}
        />

        {/* Back — rendered as a small "BACK" patch behind the torso so it's
            visible from this front view. */}
        <g>
          <Region
            d={`M70 138 Q100 132 130 138 L130 196 Q100 200 70 196 Z`}
            fill={fill('back')}
            opacity={0.45}
          />
          <text
            x={100}
            y={172}
            textAnchor="middle"
            fontSize="11"
            fill="rgba(15,23,42,0.4)"
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            BACK
          </text>
        </g>

        {/* Legs (quads + hamstrings) — two columns */}
        <Region d={`M72 282 Q70 360 76 420 L94 425 Q97 360 95 282 Z`} fill={fill('legs')} />
        <Region d={`M128 282 Q130 360 124 420 L106 425 Q103 360 105 282 Z`} fill={fill('legs')} />

        {/* Calves */}
        <Region
          d={`M76 425 Q80 460 82 484 L94 484 Q94 455 94 425 Z`}
          fill={fill('legs')}
          opacity={0.85}
        />
        <Region
          d={`M124 425 Q120 460 118 484 L106 484 Q106 455 106 425 Z`}
          fill={fill('legs')}
          opacity={0.85}
        />

        {/* Subtle vertical shading overlay for depth */}
        <rect x={0} y={0} width={W} height={H} fill="url(#body-shade)" pointerEvents="none" />
      </svg>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.4rem',
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

function Region({ d, fill, opacity }: { d: string; fill: string; opacity?: number }) {
  return (
    <path d={d} fill={fill} stroke="rgba(15,23,42,0.15)" strokeWidth={1.1} opacity={opacity} />
  );
}
