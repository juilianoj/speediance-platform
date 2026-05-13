'use client';

import { useMemo, useState } from 'react';

import type { ExerciseSummary } from '@/lib/data/load-exercises';

type SortKey = 'name' | 'last' | 'working' | 'best' | 'headroom' | 'sets';
type SortDir = 'asc' | 'desc';
type GroupMode = 'muscle' | 'none';

// Display order for muscle-group sections — matches the order on the
// Muscles page so the user sees the same mental model everywhere.
const MUSCLE_ORDER = ['chest', 'shoulders', 'back', 'arms', 'legs', 'core'] as const;
const UNGROUPED = '__ungrouped__';

export function LiftLogTable({ exercises }: { exercises: ExerciseSummary[] }) {
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('muscle');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'last',
    dir: 'desc',
  });
  // Initialise with a sentinel `__ALL__` flag meaning "everything collapsed
  // by default". On first user interaction (toggleCollapsed or expandAll) we
  // swap to a real per-section Set. This avoids racing against the section
  // list — which depends on filteredRows — being known at first render.
  const [collapsed, setCollapsed] = useState<Set<string> | 'all'>('all');

  const muscleGroups = useMemo(() => {
    const s = new Set<string>();
    for (const e of exercises) if (e.muscleGroup) s.add(e.muscleGroup);
    return ['all', ...Array.from(s).sort()];
  }, [exercises]);

  const filteredRows = useMemo(() => {
    let xs = exercises;
    const q = query.trim().toLowerCase();
    if (q) xs = xs.filter((e) => e.name.toLowerCase().includes(q));
    if (muscleFilter !== 'all') xs = xs.filter((e) => e.muscleGroup === muscleFilter);
    return [...xs].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [exercises, query, muscleFilter, sort]);

  // Partition the filtered rows into muscle-group sections (in MUSCLE_ORDER
  // first, then anything unrecognised). Only used when groupMode === 'muscle';
  // otherwise we render a flat table.
  const sections = useMemo(() => {
    if (groupMode !== 'muscle') return null;
    const buckets = new Map<string, ExerciseSummary[]>();
    for (const e of filteredRows) {
      const key = e.muscleGroup ?? UNGROUPED;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
    }
    const ordered: Array<{ key: string; label: string; rows: ExerciseSummary[] }> = [];
    for (const m of MUSCLE_ORDER) {
      const rows = buckets.get(m);
      if (rows && rows.length > 0) ordered.push({ key: m, label: capitalize(m), rows });
      buckets.delete(m);
    }
    // Append any leftover groups alphabetically, then the no-group bucket.
    const leftover = [...buckets.keys()].filter((k) => k !== UNGROUPED).sort();
    for (const k of leftover) {
      ordered.push({ key: k, label: capitalize(k), rows: buckets.get(k)! });
    }
    if (buckets.has(UNGROUPED)) {
      ordered.push({ key: UNGROUPED, label: 'Other', rows: buckets.get(UNGROUPED)! });
    }
    return ordered;
  }, [filteredRows, groupMode]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
  };

  const sectionKeys = sections?.map((s) => s.key) ?? [];
  const allCollapsed =
    collapsed === 'all' ||
    (sectionKeys.length > 0 &&
      sectionKeys.every((k) => collapsed instanceof Set && collapsed.has(k)));
  const isCollapsed = (key: string) => collapsed === 'all' || collapsed.has(key);

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = prev === 'all' ? new Set(sectionKeys) : new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(sectionKeys));
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            flex: '1 1 240px',
            maxWidth: '320px',
          }}
        />
        <select
          value={muscleFilter}
          onChange={(e) => setMuscleFilter(e.target.value)}
          style={selectStyle}
        >
          {muscleGroups.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All muscle groups' : capitalize(g)}
            </option>
          ))}
        </select>
        <select
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as GroupMode)}
          style={selectStyle}
        >
          <option value="muscle">Group by muscle</option>
          <option value="none">Flat list</option>
        </select>
        {groupMode === 'muscle' && sectionKeys.length > 0 && (
          <button type="button" onClick={toggleAll} style={ghostButtonStyle}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          {filteredRows.length} of {exercises.length}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {filteredRows.length === 0 ? (
          <p style={{ color: '#94a3b8', margin: '1rem 0 0 0' }}>No exercises match.</p>
        ) : sections ? (
          sections.map((s) => {
            const collapsedHere = isCollapsed(s.key);
            return (
              <div key={s.key} style={{ marginBottom: '1.2rem' }}>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(s.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 0.6rem',
                    border: 'none',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#475569',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '0.6rem',
                      color: '#94a3b8',
                      transition: 'transform 100ms',
                      transform: collapsedHere ? 'rotate(-90deg)' : 'none',
                    }}
                  >
                    ▾
                  </span>
                  <span>{s.label}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: '0.74rem' }}>
                    {s.rows.length}
                  </span>
                </button>
                {!collapsedHere && (
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <Th label="Exercise" k="name" sort={sort} onClick={toggleSort} />
                        <Th label="Last done" k="last" sort={sort} onClick={toggleSort} />
                        <Th label="Working" k="working" sort={sort} onClick={toggleSort} right />
                        <Th label="Best" k="best" sort={sort} onClick={toggleSort} right />
                        <Th label="Headroom" k="headroom" sort={sort} onClick={toggleSort} right />
                        <Th label="Sets" k="sets" sort={sort} onClick={toggleSort} right />
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((e) => (
                        <Row key={e.exerciseId} e={e} showGroup={false} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th label="Exercise" k="name" sort={sort} onClick={toggleSort} />
                <Th label="Group" k="name" sort={sort} onClick={toggleSort} />
                <Th label="Last done" k="last" sort={sort} onClick={toggleSort} />
                <Th label="Working" k="working" sort={sort} onClick={toggleSort} right />
                <Th label="Best" k="best" sort={sort} onClick={toggleSort} right />
                <Th label="Headroom" k="headroom" sort={sort} onClick={toggleSort} right />
                <Th label="Sets" k="sets" sort={sort} onClick={toggleSort} right />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((e) => (
                <Row key={e.exerciseId} e={e} showGroup />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Th({
  label,
  k,
  sort,
  onClick,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onClick: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th
      onClick={() => onClick(k)}
      style={{
        ...thStyle,
        textAlign: right ? 'right' : 'left',
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? '#0b78d1' : '#64748b',
      }}
    >
      {label}
      {active && <span style={{ marginLeft: '0.3rem' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function Row({ e, showGroup }: { e: ExerciseSummary; showGroup: boolean }) {
  const headroom =
    e.bestWeight !== undefined && e.workingWeight !== undefined
      ? e.bestWeight - e.workingWeight
      : undefined;
  return (
    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
      <td style={tdStyle}>
        <a
          href={`/exercises/${encodeURIComponent(e.exerciseId)}`}
          style={{ color: '#0b78d1', textDecoration: 'none', fontWeight: 500 }}
        >
          {e.name}
          {e.isUnilateral && (
            <span style={{ marginLeft: '0.4rem', color: '#94a3b8', fontSize: '0.72rem' }}>L/R</span>
          )}
        </a>
      </td>
      {showGroup && <td style={{ ...tdStyle, color: '#64748b' }}>{e.muscleGroup ?? '—'}</td>}
      <td style={{ ...tdStyle, color: '#64748b' }}>{e.lastDone ? formatDate(e.lastDone) : '—'}</td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtWt(e.workingWeight)}</td>
      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtWt(e.bestWeight)}</td>
      <td
        style={{
          ...tdStyle,
          textAlign: 'right',
          color: headroom === 0 ? '#0d9488' : '#64748b',
        }}
      >
        {headroom === undefined ? '—' : headroom === 0 ? 'at PR' : headroom.toFixed(0)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{e.totalSets ?? '—'}</td>
    </tr>
  );
}

function sortValue(e: ExerciseSummary, k: SortKey): string | number | undefined {
  if (k === 'name') return e.name.toLowerCase();
  if (k === 'last') return e.lastDone ?? '';
  if (k === 'working') return e.workingWeight ?? 0;
  if (k === 'best') return e.bestWeight ?? 0;
  if (k === 'headroom') {
    if (e.bestWeight === undefined || e.workingWeight === undefined) return -1;
    return e.bestWeight - e.workingWeight;
  }
  return e.totalSets ?? 0;
}

function fmtWt(n: number | undefined): string {
  if (n === undefined || n === 0) return '—';
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.92rem',
};

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  fontWeight: 600,
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
};

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '0.92rem',
  background: '#fff',
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '0.85rem',
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
  fontWeight: 500,
};
