'use client';

import { useMemo, useState } from 'react';

import type { WorkoutGroup } from '@/lib/data/load-workouts';

type SortMode = 'recent' | 'alpha' | 'mostDone';
type ViewMode = 'tiles' | 'list';

export function WorkoutGroupsList({ groups }: { groups: WorkoutGroup[] }) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? groups.filter((g) => g.title.toLowerCase().includes(q)) : groups;
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sortMode === 'alpha') return a.title.localeCompare(b.title);
      if (sortMode === 'mostDone') return b.count - a.count;
      return a.lastDone < b.lastDone ? 1 : -1; // recent first
    });
    return sorted;
  }, [groups, query, sortMode]);

  if (groups.length === 0) {
    return <p style={{ color: '#94a3b8', margin: '0.75rem 0 0 0' }}>No workouts logged yet.</p>;
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
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            flex: '1 1 240px',
            maxWidth: '320px',
          }}
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{
            padding: '0.5rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            background: '#fff',
          }}
        >
          <option value="recent">Most recent</option>
          <option value="alpha">A → Z</option>
          <option value="mostDone">Most done</option>
        </select>
        <div
          style={{
            display: 'flex',
            border: '1px solid #cbd5e1',
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
                background: viewMode === m ? '#0b78d1' : '#fff',
                color: viewMode === m ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: viewMode === m ? 600 : 500,
                fontSize: '0.85rem',
              }}
            >
              {m === 'list' ? 'List' : 'Tiles'}
            </button>
          ))}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          {filtered.length} of {groups.length}
        </span>
      </div>

      {viewMode === 'tiles' ? (
        <div
          style={{
            display: 'grid',
            gap: '0.6rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {filtered.map((g) => (
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
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {filtered.map((g, i) => (
            <a
              key={tileKey(g)}
              href={hrefFor(g)}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
                gap: '1.2rem',
                alignItems: 'center',
                padding: '0.7rem 1rem',
                borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
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
              <span style={{ color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                {g.count}×
              </span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                last {shortDate(g.lastDone)}
              </span>
              <span
                style={{
                  color: '#94a3b8',
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
  border: '1px solid #e5e7eb',
  borderLeft: '3px solid #0b78d1',
  borderRadius: '8px',
  background: '#fff',
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
  color: '#64748b',
  fontSize: '0.78rem',
  fontVariantNumeric: 'tabular-nums',
};
