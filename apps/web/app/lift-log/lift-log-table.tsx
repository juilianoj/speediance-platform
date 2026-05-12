'use client';

import { useMemo, useState } from 'react';

import type { ExerciseSummary } from '@/lib/data/load-exercises';

type SortKey = 'name' | 'group' | 'last' | 'working' | 'best' | 'headroom' | 'sets';
type SortDir = 'asc' | 'desc';

export function LiftLogTable({ exercises }: { exercises: ExerciseSummary[] }) {
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'last',
    dir: 'desc',
  });

  const muscleGroups = useMemo(() => {
    const s = new Set<string>();
    for (const e of exercises) if (e.muscleGroup) s.add(e.muscleGroup);
    return ['all', ...Array.from(s).sort()];
  }, [exercises]);

  const rows = useMemo(() => {
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

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
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
          style={{
            padding: '0.5rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            background: '#fff',
          }}
        >
          {muscleGroups.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All muscle groups' : capitalize(g)}
            </option>
          ))}
        </select>
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          {rows.length} of {exercises.length}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th label="Exercise" k="name" sort={sort} onClick={toggleSort} />
              <Th label="Group" k="group" sort={sort} onClick={toggleSort} />
              <Th label="Last done" k="last" sort={sort} onClick={toggleSort} />
              <Th label="Working" k="working" sort={sort} onClick={toggleSort} right />
              <Th label="Best" k="best" sort={sort} onClick={toggleSort} right />
              <Th label="Headroom" k="headroom" sort={sort} onClick={toggleSort} right />
              <Th label="Sets" k="sets" sort={sort} onClick={toggleSort} right />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={7}>
                  <span style={{ color: '#94a3b8' }}>No exercises match.</span>
                </td>
              </tr>
            ) : (
              rows.map((e) => <Row key={e.exerciseId} e={e} />)
            )}
          </tbody>
        </table>
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

function Row({ e }: { e: ExerciseSummary }) {
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
      <td style={{ ...tdStyle, color: '#64748b' }}>{e.muscleGroup ?? '—'}</td>
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
  if (k === 'group') return e.muscleGroup ?? 'zzz';
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
