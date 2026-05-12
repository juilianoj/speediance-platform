'use client';

import { useMemo, useState } from 'react';

import type { WorkoutGroup } from '@/lib/data/load-workouts';

export function WorkoutGroupsList({ groups }: { groups: WorkoutGroup[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.title.toLowerCase().includes(q));
  }, [groups, query]);

  if (groups.length === 0) {
    return <p style={{ color: '#94a3b8', margin: '0.75rem 0 0 0' }}>No workouts logged yet.</p>;
  }

  return (
    <>
      <div
        style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', marginBottom: '0.75rem' }}
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
        <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>
          {filtered.length} of {groups.length}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gap: '0.6rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        {filtered.map((g) => (
          <a
            key={g.title + (g.courseId ?? '')}
            href={`/workouts/by-title/${encodeURIComponent(g.title)}${g.courseId ? `?courseId=${g.courseId}` : ''}`}
            style={{
              display: 'block',
              padding: '0.85rem 1rem',
              border: '1px solid #e5e7eb',
              borderLeft: '3px solid #0b78d1',
              borderRadius: '8px',
              background: '#fff',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.93rem', lineHeight: 1.3 }}>{g.title}</div>
            <div
              style={{
                display: 'flex',
                gap: '0.85rem',
                marginTop: '0.4rem',
                color: '#64748b',
                fontSize: '0.78rem',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>{g.count}×</span>
              <span>last {shortDate(g.lastDone)}</span>
              <span>{Math.round(g.avgVolume).toLocaleString()} avg vol</span>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${m} ${d.getDate()}`;
}
