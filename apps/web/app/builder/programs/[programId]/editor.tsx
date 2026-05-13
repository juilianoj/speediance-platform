'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import type { WorkoutDraftRow } from '@/lib/builder/actions';
import {
  deleteProgram,
  updateProgram,
  type ProgramDraftRow,
  type ProgramSlot,
} from '@/lib/builder/program-actions';

interface Props {
  program: ProgramDraftRow;
  drafts: WorkoutDraftRow[];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AUTOSAVE_DELAY_MS = 600;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ProgramEditor({ program, drafts }: Props) {
  const [name, setName] = useState(program.name);
  const [notes, setNotes] = useState(program.notes ?? '');
  const [weekCount, setWeekCount] = useState(program.weekCount);
  const [slots, setSlots] = useState<ProgramSlot[]>(program.slots ?? []);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const draftById = useMemo(() => {
    const m = new Map<string, WorkoutDraftRow>();
    for (const d of drafts) m.set(d.draftId, d);
    return m;
  }, [drafts]);

  // Debounced autosave matching the workout-editor pattern.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef({
    name: program.name,
    notes: program.notes ?? '',
    weekCount: program.weekCount,
    slots: program.slots ?? [],
  });
  useEffect(() => {
    const l = lastSaved.current;
    if (
      l.name === name &&
      l.notes === notes &&
      l.weekCount === weekCount &&
      JSON.stringify(l.slots) === JSON.stringify(slots)
    ) {
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus('saving');
      const r = await updateProgram(program.programId, { name, notes, weekCount, slots });
      if (r.ok) {
        lastSaved.current = { name, notes, weekCount, slots };
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 1200);
      } else {
        setStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [name, notes, weekCount, slots, program.programId]);

  const addSlot = (weekIndex: number, dayOfWeek: number, draftId: string) => {
    // Replace any existing slot in this cell (one workout per day-of-week
    // per week is the natural slot semantics for v1; supporting multiple
    // per day comes when the program scheduler needs it).
    setSlots((prev) => [
      ...prev.filter((s) => !(s.weekIndex === weekIndex && s.dayOfWeek === dayOfWeek)),
      { weekIndex, dayOfWeek, draftId },
    ]);
  };

  const removeSlot = (weekIndex: number, dayOfWeek: number) => {
    setSlots((prev) =>
      prev.filter((s) => !(s.weekIndex === weekIndex && s.dayOfWeek === dayOfWeek)),
    );
  };

  const slotAt = (week: number, dow: number) =>
    slots.find((s) => s.weekIndex === week && s.dayOfWeek === dow);

  return (
    <>
      <section style={cardStyle}>
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Program name"
            maxLength={120}
            style={titleInputStyle}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's the goal? When are you running this? Any constraints?"
            rows={2}
            maxLength={5000}
            style={notesStyle}
          />
        </div>
        <div
          style={{
            marginTop: '0.6rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.82rem',
            flexWrap: 'wrap',
          }}
        >
          <SaveBadge status={status} />
          <span style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ color: '#64748b' }}>Weeks</span>
            <input
              type="number"
              value={weekCount}
              onChange={(e) => {
                const v = Math.max(1, Math.min(16, Number(e.target.value) || 1));
                setWeekCount(v);
                // Drop slots that fell off the end when the program shrinks.
                setSlots((prev) => prev.filter((s) => s.weekIndex < v));
              }}
              min={1}
              max={16}
              style={{
                width: '4rem',
                padding: '0.35rem 0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.92rem',
              }}
            />
          </label>
          <DeleteProgramButton programId={program.programId} />
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Schedule</h2>
        <p style={mutedStyle}>
          One workout per day-of-week per week. Click an empty cell to assign a workout, click an
          assigned cell to remove or swap.
        </p>

        {drafts.length === 0 ? (
          <p style={{ color: '#94a3b8', margin: '1rem 0 0 0' }}>
            No workouts to assign. Build at least one first.
          </p>
        ) : (
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                minWidth: '700px',
              }}
            >
              <thead>
                <tr>
                  <th style={cellHeadStyle}></th>
                  {DOW.map((d) => (
                    <th key={d} style={cellHeadStyle}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: weekCount }).map((_, weekIndex) => (
                  <tr key={weekIndex}>
                    <th style={weekHeadStyle}>Week {weekIndex + 1}</th>
                    {DOW.map((_label, dow) => {
                      const slot = slotAt(weekIndex, dow);
                      const draft = slot ? draftById.get(slot.draftId) : undefined;
                      return (
                        <td key={dow} style={cellBodyStyle}>
                          <SlotCell
                            slot={slot}
                            draft={draft}
                            draftsAll={drafts}
                            onAssign={(draftId) => addSlot(weekIndex, dow, draftId)}
                            onRemove={() => removeSlot(weekIndex, dow)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, background: '#f8fafc' }}>
        <h2 style={cardHeadingStyle}>Schedule to Speediance</h2>
        <p style={mutedStyle}>
          Coming next (PR ε) — pick a start date, the platform will save every assigned workout to
          Speediance and reserve each calendar day.
        </p>
        <p
          style={{
            margin: '0.6rem 0 0',
            color: '#94a3b8',
            fontSize: '0.85rem',
            fontStyle: 'italic',
          }}
        >
          Filled slots: {slots.length} of {weekCount * 7} possible.
        </p>
      </section>
    </>
  );
}

function SlotCell({
  slot,
  draft,
  draftsAll,
  onAssign,
  onRemove,
}: {
  slot: ProgramSlot | undefined;
  draft: WorkoutDraftRow | undefined;
  draftsAll: WorkoutDraftRow[];
  onAssign: (draftId: string) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);

  if (slot) {
    return (
      <div
        style={{
          minHeight: '54px',
          padding: '0.4rem 0.55rem',
          background: draft ? '#eef5fc' : '#fee2e2',
          border: `1px solid ${draft ? '#cce2f4' : '#fecaca'}`,
          borderRadius: '6px',
          fontSize: '0.82rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.3rem',
        }}
      >
        <span
          style={{
            fontWeight: 500,
            color: draft ? '#0b5fa8' : '#b91c1c',
            wordBreak: 'break-word',
            flex: 1,
            minWidth: 0,
          }}
        >
          {draft?.name ?? 'missing draft'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 0,
            fontSize: '0.8rem',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  if (picking) {
    return (
      <select
        autoFocus
        defaultValue=""
        onBlur={() => setPicking(false)}
        onChange={(e) => {
          if (e.target.value) onAssign(e.target.value);
          setPicking(false);
        }}
        style={{
          width: '100%',
          minHeight: '54px',
          padding: '0.35rem 0.5rem',
          border: '1px solid #0b78d1',
          borderRadius: '6px',
          fontSize: '0.82rem',
          background: '#fff',
        }}
      >
        <option value="" disabled>
          Pick…
        </option>
        {draftsAll.map((d) => (
          <option key={d.draftId} value={d.draftId}>
            {d.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPicking(true)}
      style={{
        width: '100%',
        minHeight: '54px',
        border: '1px dashed #cbd5e1',
        background: '#fff',
        borderRadius: '6px',
        cursor: 'pointer',
        color: '#94a3b8',
        fontSize: '0.82rem',
      }}
    >
      +
    </button>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return <span style={{ color: '#94a3b8' }}>All changes saved.</span>;
  if (status === 'saving') return <span style={{ color: '#0b78d1' }}>Saving…</span>;
  if (status === 'saved') return <span style={{ color: '#0d9488' }}>✓ Saved</span>;
  return <span style={{ color: '#b91c1c' }}>Save failed</span>;
}

function DeleteProgramButton({ programId }: { programId: string }) {
  const [pending, startTransition] = useTransition();
  const onClick = () => {
    if (!confirm('Delete this program? Cannot be undone.')) return;
    startTransition(async () => {
      const r = await deleteProgram(programId);
      if (r.ok) window.location.href = '/builder';
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        background: 'transparent',
        border: '1px solid #fecaca',
        color: '#b91c1c',
        borderRadius: '6px',
        padding: '0.35rem 0.7rem',
        fontSize: '0.82rem',
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Deleting…' : 'Delete program'}
    </button>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '1.1rem 1.25rem',
  marginBottom: '1rem',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};
const cardHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};
const mutedStyle: React.CSSProperties = {
  margin: '0.3rem 0 0 0',
  color: '#64748b',
  fontSize: '0.88rem',
};
const titleInputStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  fontSize: '1.4rem',
  fontWeight: 700,
  outline: 'none',
  padding: '0.2rem 0',
  background: 'transparent',
  color: '#0f172a',
};
const notesStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '0.55rem 0.7rem',
  fontSize: '0.92rem',
  fontFamily: 'inherit',
  resize: 'vertical',
  background: '#fafbfc',
  color: '#1f2937',
};
const cellHeadStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#94a3b8',
  fontWeight: 700,
  textAlign: 'center',
};
const weekHeadStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#475569',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const cellBodyStyle: React.CSSProperties = {
  padding: '0.25rem',
  verticalAlign: 'top',
};
