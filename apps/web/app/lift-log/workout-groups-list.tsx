'use client';

import { useMemo, useState } from 'react';

import type { WorkoutGroup } from '@/lib/data/load-workouts';

type SortMode = 'recent' | 'alpha' | 'mostDone';
type ViewMode = 'tiles' | 'list';

// Display order for workout-type sections. Matches the rough top-down
// muscle map: full body / upper / lower up top, then individual splits
// in head-to-toe order, then Other for anything we can't classify.
const TYPE_ORDER = [
  'fullBody',
  'upperBody',
  'lowerBody',
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'other',
] as const;
type TypeKey = (typeof TYPE_ORDER)[number];

const TYPE_LABEL: Record<TypeKey, string> = {
  fullBody: 'Full body',
  upperBody: 'Upper body',
  lowerBody: 'Lower body',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
  other: 'Other',
};

/**
 * Best-effort classifier from a workout title. Speediance doesn't tag
 * workouts with a body-part category we can read directly, so we keyword-
 * match against the title. Priority order matters: "full body" beats any
 * single muscle group; "legs and arms" goes to the lower-body bucket
 * because lower-body comes earlier than arms in TYPE_ORDER.
 */
function classify(title: string): TypeKey {
  const t = title.toLowerCase();
  if (t.includes('full body')) return 'fullBody';
  if (t.includes('upper body')) return 'upperBody';
  if (t.includes('lower body')) return 'lowerBody';
  if (t.includes('chest') || t.includes('bench press') || t.includes('push')) return 'chest';
  if (t.includes('back') || t.includes('lat') || t.includes('row') || t.includes('pull'))
    return 'back';
  if (t.includes('shoulder') || t.includes('delt')) return 'shoulders';
  if (t.includes('leg') || t.includes('squat') || t.includes('deadlift') || t.includes('glute'))
    return 'legs';
  if (t.includes('arm') || t.includes('bicep') || t.includes('tricep') || t.includes('curl'))
    return 'arms';
  if (t.includes('core') || t.includes('abs') || t.includes('ab ')) return 'core';
  return 'other';
}

export function WorkoutGroupsList({ groups }: { groups: WorkoutGroup[] }) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  // Same sentinel pattern as the exercise table: "all" means everything
  // collapsed; once the user touches a section it becomes a real Set.
  const [collapsed, setCollapsed] = useState<Set<TypeKey> | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? groups.filter((g) => g.title.toLowerCase().includes(q)) : groups;
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sortMode === 'alpha') return a.title.localeCompare(b.title);
      if (sortMode === 'mostDone') return b.count - a.count;
      return a.lastDone < b.lastDone ? 1 : -1;
    });
    return sorted;
  }, [groups, query, sortMode]);

  const sections = useMemo(() => {
    const buckets = new Map<TypeKey, WorkoutGroup[]>();
    for (const g of filtered) {
      const k = classify(g.title);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(g);
    }
    return TYPE_ORDER.map((k) => ({
      key: k,
      label: TYPE_LABEL[k],
      rows: buckets.get(k) ?? [],
    })).filter((s) => s.rows.length > 0);
  }, [filtered]);

  const sectionKeys = sections.map((s) => s.key);
  const allCollapsed =
    collapsed === 'all' ||
    (sectionKeys.length > 0 &&
      sectionKeys.every((k) => collapsed instanceof Set && collapsed.has(k)));
  const isCollapsed = (key: TypeKey) => collapsed === 'all' || collapsed.has(key);

  const toggleCollapsed = (key: TypeKey) => {
    setCollapsed((prev) => {
      const next = prev === 'all' ? new Set<TypeKey>(sectionKeys) : new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set<TypeKey>());
    else setCollapsed(new Set<TypeKey>(sectionKeys));
  };

  if (groups.length === 0) {
    return (
      <p style={{ color: 'var(--text-faint)', margin: '0.75rem 0 0 0' }}>No workouts logged yet.</p>
    );
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          marginTop: '0.75rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter workouts…"
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            fontSize: '0.92rem',
            flex: '1 1 240px',
            maxWidth: '320px',
          }}
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={selectStyle}
        >
          <option value="recent">Most recent</option>
          <option value="alpha">A → Z</option>
          <option value="mostDone">Most done</option>
        </select>
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            overflow: 'hidden',
            fontSize: '0.85rem',
          }}
        >
          {(['list', 'tiles'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              style={{
                padding: '0.45rem 0.7rem',
                border: 'none',
                background: viewMode === m ? 'var(--accent)' : 'var(--bg-card)',
                color: viewMode === m ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: viewMode === m ? 600 : 500,
                fontSize: '0.85rem',
              }}
            >
              {m === 'list' ? 'List' : 'Tiles'}
            </button>
          ))}
        </div>
        {sectionKeys.length > 0 && (
          <button type="button" onClick={toggleAll} style={ghostButtonStyle}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>
          {filtered.length} of {groups.length}
        </span>
      </div>

      {sections.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', margin: '0.75rem 0 0 0' }}>No workouts match.</p>
      ) : (
        sections.map((s) => {
          const collapsedHere = isCollapsed(s.key);
          return (
            <div key={s.key} style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => toggleCollapsed(s.key)}
                style={sectionHeaderStyle}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '0.6rem',
                    color: 'var(--text-faint)',
                    transition: 'transform 100ms',
                    transform: collapsedHere ? 'rotate(-90deg)' : 'none',
                  }}
                >
                  ▾
                </span>
                <span>{s.label}</span>
                <span style={{ color: 'var(--text-faint)', fontWeight: 500, fontSize: '0.74rem' }}>
                  {s.rows.length}
                </span>
              </button>
              {!collapsedHere &&
                (viewMode === 'tiles' ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: '0.6rem',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      marginTop: '0.6rem',
                    }}
                  >
                    {s.rows.map((g) => (
                      <a key={tileKey(g)} href={hrefFor(g)} style={tileStyle}>
                        <div style={tileTitleStyle}>{g.title}</div>
                        <div style={tileMetaStyle}>
                          <span>{g.count}×</span>
                          <span>last {shortDate(g.lastDone)}</span>
                          <span>{Math.round(g.avgVolume).toLocaleString()} avg vol</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: '0.6rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: 'var(--bg-card)',
                    }}
                  >
                    {s.rows.map((g, i) => (
                      <a
                        key={tileKey(g)}
                        href={hrefFor(g)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
                          gap: '1.2rem',
                          alignItems: 'center',
                          padding: '0.7rem 1rem',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)',
                          textDecoration: 'none',
                          color: 'inherit',
                          fontSize: '0.92rem',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {g.title}
                        </div>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {g.count}×
                        </span>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          last {shortDate(g.lastDone)}
                        </span>
                        <span
                          style={{
                            color: 'var(--text-faint)',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {Math.round(g.avgVolume).toLocaleString()} vol
                        </span>
                      </a>
                    ))}
                  </div>
                ))}
            </div>
          );
        })
      )}
    </>
  );
}

function tileKey(g: WorkoutGroup): string {
  return g.title + (g.courseId ?? '');
}

function hrefFor(g: WorkoutGroup): string {
  return `/workouts/by-title/${encodeURIComponent(g.title)}${g.courseId ? `?courseId=${g.courseId}` : ''}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}

const tileStyle: React.CSSProperties = {
  display: 'block',
  padding: '0.85rem 1rem',
  border: '1px solid var(--border)',
  borderLeft: '3px solid #0b78d1',
  borderRadius: '8px',
  background: 'var(--bg-card)',
  textDecoration: 'none',
  color: 'inherit',
};

const tileTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.93rem',
  lineHeight: 1.3,
};

const tileMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.85rem',
  marginTop: '0.4rem',
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  fontVariantNumeric: 'tabular-nums',
};

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  fontSize: '0.92rem',
  background: 'var(--bg-card)',
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  fontSize: '0.85rem',
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontWeight: 500,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  textAlign: 'left',
  padding: '0.5rem 0.6rem',
  border: 'none',
  background: 'var(--bg-subtle)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.78rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};
