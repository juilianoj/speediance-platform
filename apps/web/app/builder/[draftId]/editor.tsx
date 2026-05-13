'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import type { CatalogExercise } from '@/lib/catalog/lookup';
import {
  deleteDraft,
  saveDraftToSpeediance,
  unsaveDraftFromSpeediance,
  updateDraft,
  type DraftExercise,
  type WorkoutDraftRow,
} from '@/lib/builder/actions';

interface Props {
  draft: WorkoutDraftRow;
  catalog: CatalogExercise[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 600;

export function Editor({ draft, catalog }: Props) {
  const [name, setName] = useState(draft.name);
  const [notes, setNotes] = useState(draft.notes ?? '');
  const [exercises, setExercises] = useState<DraftExercise[]>(draft.exercises ?? []);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Maps groupId → CatalogExercise for O(1) lookups while rendering.
  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogExercise>();
    for (const e of catalog) m.set(e.groupId, e);
    return m;
  }, [catalog]);

  // Debounced autosave. Any time `name`, `notes`, or `exercises` changes
  // we kick off a save 600ms after the last keystroke. The Save badge
  // surfaces in-flight state so the user knows their edits are persisted.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef({
    name: draft.name,
    notes: draft.notes ?? '',
    exercises: draft.exercises ?? [],
  });

  useEffect(() => {
    // Skip autosave on first render — the values match draft, no diff to push.
    const last = lastSavedRef.current;
    if (
      last.name === name &&
      last.notes === notes &&
      JSON.stringify(last.exercises) === JSON.stringify(exercises)
    ) {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // `save` is stable enough that excluding it keeps the dependency array
    // honest about what actually triggers an autosave. (The
    // react-hooks/exhaustive-deps rule isn't registered in our flat config,
    // so a directive targeting it would itself be a lint error.)
  }, [name, notes, exercises]);

  const save = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);
    const res = await updateDraft(draft.draftId, { name, notes, exercises });
    if (res.ok) {
      lastSavedRef.current = { name, notes, exercises };
      setSaveStatus('saved');
      // Briefly show "Saved", then fade back to idle.
      setTimeout(() => setSaveStatus('idle'), 1200);
    } else {
      setSaveStatus('error');
      setErrorMessage(res.message ?? 'Save failed.');
    }
  };

  return (
    <>
      <section style={cardStyle}>
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workout name"
            maxLength={120}
            style={titleInputStyle}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional) — focus, intent, anything to remember about this workout."
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
          }}
        >
          <SaveBadge status={saveStatus} />
          {errorMessage && <span style={{ color: '#b91c1c' }}>{errorMessage}</span>}
          <span style={{ flex: 1 }} />
          {draft.status === 'saved-to-speediance' && (
            <span
              style={{
                color: '#0d9488',
                fontSize: '0.74rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Synced to Speediance
            </span>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Exercises</h2>
        <p style={mutedStyle}>
          {exercises.length === 0
            ? 'Add your first exercise below. The builder shows the device setup so you can plan around cable-position changes.'
            : `${exercises.length} exercise${exercises.length === 1 ? '' : 's'} planned.`}
        </p>

        {exercises.length > 0 && <TransitionSummary exercises={exercises} catalog={catalogById} />}

        <div style={{ display: 'grid', gap: '0.85rem', marginTop: '0.9rem' }}>
          {exercises.map((ex, idx) => (
            <ExerciseCard
              key={`${ex.groupId}-${idx}`}
              exercise={ex}
              index={idx}
              total={exercises.length}
              catalogEntry={catalogById.get(ex.groupId)}
              prevCatalogEntry={idx > 0 ? catalogById.get(exercises[idx - 1]!.groupId) : undefined}
              onChange={(next) =>
                setExercises((prev) => prev.map((e, i) => (i === idx ? next : e)))
              }
              onRemove={() => setExercises((prev) => prev.filter((_, i) => i !== idx))}
              onMoveUp={() => moveExercise(setExercises, idx, idx - 1)}
              onMoveDown={() => moveExercise(setExercises, idx, idx + 1)}
            />
          ))}
        </div>

        <ExerciseSearch
          catalog={catalog}
          onAdd={(groupId) =>
            setExercises((prev) => [
              ...prev,
              { groupId, sets: [{ reps: 10, weight: undefined, restSeconds: 60 }] },
            ])
          }
        />
      </section>

      <SpeedianceSaveCard
        draftId={draft.draftId}
        status={draft.status}
        templateCode={draft.speedianceTemplateCode}
        hasExercises={exercises.length > 0}
        hasUnsavedChanges={saveStatus !== 'idle' && saveStatus !== 'saved'}
      />

      <DangerZone draftId={draft.draftId} />
    </>
  );
}

function DangerZone({ draftId }: { draftId: string }) {
  return (
    <section
      style={{
        ...cardStyle,
        borderLeft: '3px solid #fecaca',
      }}
    >
      <h2 style={{ ...cardHeadingStyle, color: '#b91c1c' }}>Danger zone</h2>
      <p style={mutedStyle}>Deleting this draft can&apos;t be undone.</p>
      <div style={{ marginTop: '0.85rem' }}>
        <DeleteDraftButton draftId={draftId} />
      </div>
    </section>
  );
}

/**
 * Save-to-Speediance action card. Shows different controls based on
 * status:
 *  - `draft`: "Save to Speediance" button (creates the template).
 *  - `saved-to-speediance`: "Update Speediance copy" + "Remove from
 *    Speediance" buttons, plus a small confirmation that the template
 *    is live on the user's mobile app.
 */
function SpeedianceSaveCard({
  draftId,
  status,
  templateCode,
  hasExercises,
  hasUnsavedChanges,
}: {
  draftId: string;
  status: 'draft' | 'saved-to-speediance';
  templateCode: string | undefined;
  hasExercises: boolean;
  hasUnsavedChanges: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const onSave = () =>
    startTransition(async () => {
      setResult(null);
      const r = await saveDraftToSpeediance(draftId);
      setResult(r);
    });

  const onUnsave = () =>
    startTransition(async () => {
      if (!confirm('Remove this workout from Speediance? It will stay here as a draft.')) return;
      setResult(null);
      const r = await unsaveDraftFromSpeediance(draftId);
      setResult(r);
    });

  return (
    <section
      style={{
        ...cardStyle,
        borderLeft: status === 'saved-to-speediance' ? '3px solid #0d9488' : '3px solid #94a3b8',
      }}
    >
      <h2 style={cardHeadingStyle}>
        {status === 'saved-to-speediance' ? 'Live on Speediance' : 'Save to Speediance'}
      </h2>
      <p style={mutedStyle}>
        {status === 'saved-to-speediance'
          ? 'This workout is in your Speediance app and ready to schedule or start. Edits here stay private until you click "Update Speediance copy".'
          : 'Push this draft to your Speediance mobile app as a custom training template. You can still edit it here afterward.'}
      </p>

      <div
        style={{
          marginTop: '0.85rem',
          display: 'flex',
          gap: '0.6rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !hasExercises || hasUnsavedChanges}
          style={primarySaveButtonStyle(pending || !hasExercises || hasUnsavedChanges)}
          title={
            !hasExercises
              ? 'Add at least one exercise first.'
              : hasUnsavedChanges
                ? 'Wait for autosave to finish.'
                : status === 'saved-to-speediance'
                  ? 'Replaces the existing Speediance template with the current draft.'
                  : 'Pushes this workout to Speediance.'
          }
        >
          {pending
            ? 'Pushing…'
            : status === 'saved-to-speediance'
              ? 'Update Speediance copy'
              : 'Save to Speediance'}
        </button>
        {status === 'saved-to-speediance' && (
          <button
            type="button"
            onClick={onUnsave}
            disabled={pending}
            style={secondaryButtonStyle(pending)}
          >
            Remove from Speediance
          </button>
        )}
        {templateCode && (
          <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontFamily: 'monospace' }}>
            Template: {templateCode.slice(0, 8)}…
          </span>
        )}
      </div>

      {result && (
        <p
          style={{
            margin: '0.6rem 0 0',
            fontSize: '0.9rem',
            color: result.ok ? '#0d9488' : '#b91c1c',
          }}
        >
          {result.ok
            ? '✓ Synced to Speediance. Open the mobile app to see it.'
            : (result.message ?? 'Action failed.')}
        </p>
      )}
    </section>
  );
}

function primarySaveButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.6rem 1.1rem',
    background: disabled ? '#94a3b8' : '#0b78d1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.92rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.6rem 0.95rem',
    background: '#fff',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    fontWeight: 500,
    fontSize: '0.9rem',
    cursor: disabled ? 'wait' : 'pointer',
  };
}

function moveExercise(
  setExercises: React.Dispatch<React.SetStateAction<DraftExercise[]>>,
  from: number,
  to: number,
) {
  setExercises((prev) => {
    if (to < 0 || to >= prev.length) return prev;
    const next = [...prev];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    return next;
  });
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return <span style={{ color: '#94a3b8' }}>All changes saved.</span>;
  if (status === 'saving') return <span style={{ color: '#0b78d1' }}>Saving…</span>;
  if (status === 'saved') return <span style={{ color: '#0d9488' }}>✓ Saved</span>;
  return <span style={{ color: '#b91c1c' }}>Save failed</span>;
}

function DeleteDraftButton({ draftId }: { draftId: string }) {
  const [pending, startTransition] = useTransition();
  const onClick = () => {
    if (!confirm('Delete this draft? Cannot be undone.')) return;
    startTransition(async () => {
      const res = await deleteDraft(draftId);
      if (res.ok) window.location.href = '/builder';
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
      {pending ? 'Deleting…' : 'Delete draft'}
    </button>
  );
}

/**
 * Renders one exercise's card — name + setup, reorder, sets table.
 * Receives the previous catalog entry so it can flag an equipment
 * transition above this card (e.g. "↑ cable position changes from
 * floor to high").
 */
function ExerciseCard({
  exercise,
  index,
  total,
  catalogEntry,
  prevCatalogEntry,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  exercise: DraftExercise;
  index: number;
  total: number;
  catalogEntry: CatalogExercise | undefined;
  prevCatalogEntry: CatalogExercise | undefined;
  onChange: (next: DraftExercise) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const name = catalogEntry?.name ?? `Exercise ${exercise.groupId} (not in catalog)`;
  const transitionWarning =
    catalogEntry && prevCatalogEntry && catalogEntry.equipmentKey !== prevCatalogEntry.equipmentKey
      ? describeTransition(prevCatalogEntry, catalogEntry)
      : null;

  return (
    <div>
      {transitionWarning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.7rem',
            margin: '0 0 0.35rem 0.35rem',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '4px',
            fontSize: '0.78rem',
            width: 'fit-content',
          }}
        >
          ⤳ {transitionWarning}
        </div>
      )}
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          background: '#fff',
          padding: '0.9rem 1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>{name}</div>
            <EquipmentChips entry={catalogEntry} />
            {catalogEntry?.setupInstructions && (
              <p
                style={{
                  margin: '0.45rem 0 0',
                  fontSize: '0.85rem',
                  color: '#475569',
                  fontStyle: 'italic',
                }}
              >
                {catalogEntry.setupInstructions}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
            <IconButton title="Move up" disabled={index === 0} onClick={onMoveUp}>
              ↑
            </IconButton>
            <IconButton title="Move down" disabled={index === total - 1} onClick={onMoveDown}>
              ↓
            </IconButton>
            <IconButton title="Remove" onClick={onRemove}>
              ✕
            </IconButton>
          </div>
        </div>

        <SetsTable sets={exercise.sets} onChange={(sets) => onChange({ ...exercise, sets })} />

        <input
          type="text"
          value={exercise.notes ?? ''}
          onChange={(e) => onChange({ ...exercise, notes: e.target.value })}
          placeholder="Notes for this exercise (form cues, supersets, etc.)"
          maxLength={1000}
          style={{
            marginTop: '0.6rem',
            width: '100%',
            padding: '0.45rem 0.6rem',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '0.85rem',
            background: '#fafbfc',
          }}
        />
      </div>
    </div>
  );
}

function EquipmentChips({ entry }: { entry: CatalogExercise | undefined }) {
  if (!entry) return null;
  const chips: string[] = [];
  if (entry.muscleGroup) chips.push(`muscle: ${entry.muscleGroup}`);
  if (entry.outPosition !== undefined) {
    chips.push(`cable: ${entry.outPosition === 0 ? 'high' : 'low'}`);
  }
  if (entry.accessoryNames && entry.accessoryNames.length > 0) {
    chips.push(entry.accessoryNames.join(' + '));
  }
  if (entry.benchAngle) chips.push(`bench ${entry.benchAngle}`);
  if (entry.isUnilateral) chips.push('L/R');
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
      {chips.map((c, i) => (
        <span
          key={i}
          style={{
            padding: '0.18rem 0.5rem',
            background: '#eef5fc',
            color: '#0b5fa8',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 500,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function describeTransition(prev: CatalogExercise, next: CatalogExercise): string {
  const parts: string[] = [];
  if (prev.outPosition !== next.outPosition) {
    const fromLabel = prev.outPosition === 0 ? 'high' : 'low';
    const toLabel = next.outPosition === 0 ? 'high' : 'low';
    parts.push(`move cables ${fromLabel} → ${toLabel}`);
  }
  const prevAcc = (prev.accessoryNames ?? []).join(' + ');
  const nextAcc = (next.accessoryNames ?? []).join(' + ');
  if (prevAcc !== nextAcc) {
    parts.push(`swap to ${nextAcc || 'no attachment'}`);
  }
  if ((prev.benchAngle ?? '') !== (next.benchAngle ?? '')) {
    parts.push(next.benchAngle ? `bench ${next.benchAngle}` : 'remove bench');
  }
  return parts.length > 0 ? parts.join(' · ') : 'equipment change';
}

function TransitionSummary({
  exercises,
  catalog,
}: {
  exercises: DraftExercise[];
  catalog: Map<string, CatalogExercise>;
}) {
  let transitions = 0;
  for (let i = 1; i < exercises.length; i++) {
    const a = catalog.get(exercises[i - 1]!.groupId);
    const b = catalog.get(exercises[i]!.groupId);
    if (a && b && a.equipmentKey !== b.equipmentKey) transitions++;
  }
  if (exercises.length < 2) return null;
  const totalAdjacent = exercises.length - 1;
  const shared = totalAdjacent - transitions;
  const message =
    transitions === 0
      ? 'Clean order — no equipment changes mid-workout.'
      : transitions === 1
        ? `1 equipment change needed (the other ${shared} share setup).`
        : `${transitions} equipment changes needed (${shared} share setup).`;
  return <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#475569' }}>{message}</p>;
}

function SetsTable({
  sets,
  onChange,
}: {
  sets: DraftExercise['sets'];
  onChange: (next: DraftExercise['sets']) => void;
}) {
  const updateSet = (i: number, patch: Partial<DraftExercise['sets'][number]>) => {
    onChange(sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const addSet = () => {
    const last = sets[sets.length - 1];
    onChange([...sets, last ? { ...last } : { reps: 10, restSeconds: 60 }]);
  };
  const removeSet = (i: number) => onChange(sets.filter((_, idx) => idx !== i));

  return (
    <div style={{ marginTop: '0.8rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 90px 110px 110px 28px',
          gap: '0.5rem',
          fontSize: '0.72rem',
          color: '#94a3b8',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '0 0.25rem',
          marginBottom: '0.25rem',
        }}
      >
        <span>Set</span>
        <span>Reps</span>
        <span>Weight (lb)</span>
        <span>Rest (s)</span>
        <span />
      </div>
      {sets.map((s, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 90px 110px 110px 28px',
            gap: '0.5rem',
            alignItems: 'center',
            padding: '0.2rem 0',
          }}
        >
          <span
            style={{
              color: '#64748b',
              fontSize: '0.85rem',
              fontWeight: 600,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {i + 1}
          </span>
          <NumberInput
            value={s.reps}
            onChange={(v) => updateSet(i, { reps: v })}
            placeholder="10"
            min={1}
            max={200}
          />
          <NumberInput
            value={s.weight}
            onChange={(v) => updateSet(i, { weight: v })}
            placeholder="—"
            min={0}
            max={1000}
            step={2.5}
          />
          <NumberInput
            value={s.restSeconds}
            onChange={(v) => updateSet(i, { restSeconds: v })}
            placeholder="60"
            min={0}
            max={600}
            step={15}
          />
          <IconButton title="Remove set" onClick={() => removeSet(i)} disabled={sets.length === 1}>
            ✕
          </IconButton>
        </div>
      ))}
      <button
        type="button"
        onClick={addSet}
        style={{
          marginTop: '0.4rem',
          padding: '0.35rem 0.7rem',
          background: '#f1f5f9',
          color: '#475569',
          border: '1px dashed #cbd5e1',
          borderRadius: '6px',
          fontSize: '0.82rem',
          cursor: 'pointer',
        }}
      >
        + Add set
      </button>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return onChange(undefined);
        const n = Number(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      style={{
        padding: '0.4rem 0.55rem',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        fontSize: '0.92rem',
        fontVariantNumeric: 'tabular-nums',
        width: '100%',
        minWidth: 0,
      }}
    />
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: '28px',
        height: '28px',
        background: '#fff',
        color: disabled ? '#cbd5e1' : '#475569',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.82rem',
        padding: 0,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function ExerciseSearch({
  catalog,
  onAdd,
}: {
  catalog: CatalogExercise[];
  onAdd: (groupId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string>('all');

  const muscleGroups = useMemo(() => {
    const s = new Set<string>();
    for (const e of catalog) if (e.muscleGroup) s.add(e.muscleGroup);
    return ['all', ...[...s].sort()];
  }, [catalog]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let xs = catalog;
    if (q) xs = xs.filter((e) => e.name.toLowerCase().includes(q));
    if (muscleFilter !== 'all') xs = xs.filter((e) => e.muscleGroup === muscleFilter);
    return xs.slice(0, 30);
  }, [catalog, query, muscleFilter]);

  const handleAdd = useCallback(
    (groupId: string) => {
      onAdd(groupId);
      setQuery('');
    },
    [onAdd],
  );

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem 1rem',
        background: '#f8fafc',
        border: '1px dashed #cbd5e1',
        borderRadius: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add an exercise — search by name…"
          style={{
            flex: '1 1 240px',
            padding: '0.55rem 0.75rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            background: '#fff',
          }}
        />
        <select
          value={muscleFilter}
          onChange={(e) => setMuscleFilter(e.target.value)}
          style={{
            padding: '0.55rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.92rem',
            background: '#fff',
          }}
        >
          {muscleGroups.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All groups' : g.charAt(0).toUpperCase() + g.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {(query.trim().length > 0 || muscleFilter !== 'all') && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0.6rem 0 0 0',
            display: 'grid',
            gap: '0.3rem',
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          {results.length === 0 ? (
            <li style={{ color: '#94a3b8', fontSize: '0.88rem', padding: '0.4rem' }}>
              No matches.
            </li>
          ) : (
            results.map((r) => (
              <li key={r.groupId}>
                <button
                  type="button"
                  onClick={() => handleAdd(r.groupId)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.45rem 0.7rem',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>
                    {r.muscleGroup ?? '—'}
                    {r.outPosition !== undefined &&
                      ` · cable ${r.outPosition === 0 ? 'high' : 'low'}`}
                    {r.accessoryNames &&
                      r.accessoryNames.length > 0 &&
                      ` · ${r.accessoryNames.join('+')}`}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────

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
