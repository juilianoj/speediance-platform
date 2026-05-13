'use client';

import { useRef, useState, useTransition } from 'react';

import { addNote, deleteNote } from '@/lib/notes/actions';

export function AddNoteForm({
  targetType,
  targetId,
}: {
  targetType: 'workout' | 'exercise';
  targetId: string;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const fd = new FormData();
    fd.set('targetType', targetType);
    fd.set('targetId', targetId);
    fd.set('body', trimmed);
    startTransition(async () => {
      const res = await addNote(fd);
      if (res.ok) {
        setBody('');
        setError(null);
        textareaRef.current?.focus();
      } else {
        setError(res.message ?? 'Save failed.');
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.85rem' }}>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl + Enter submits — common pattern for short-form
          // text inputs that allow multiline.
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Form felt great. Left wrist a little tight — wrap next time."
        rows={3}
        maxLength={5000}
        disabled={pending}
        style={{
          width: '100%',
          padding: '0.65rem 0.8rem',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          fontSize: '0.95rem',
          fontFamily: 'inherit',
          resize: 'vertical',
          minHeight: '4.5rem',
          background: pending ? '#f8fafc' : '#fff',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {error ? (
          <span style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</span>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>⌘/Ctrl + Enter to save</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending || body.trim().length === 0}
          style={{
            padding: '0.5rem 1rem',
            background: pending || body.trim().length === 0 ? '#94a3b8' : '#0b78d1',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: pending ? 'wait' : body.trim().length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
}

export function DeleteNoteButton({
  targetType,
  targetId,
  createdAt,
}: {
  targetType: 'workout' | 'exercise';
  targetId: string;
  createdAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const onClick = () => {
    if (!confirm('Delete this note?')) return;
    const fd = new FormData();
    fd.set('targetType', targetType);
    fd.set('targetId', targetId);
    fd.set('createdAt', createdAt);
    startTransition(async () => {
      await deleteNote(fd);
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Delete note"
      style={{
        background: 'transparent',
        border: 'none',
        color: pending ? '#cbd5e1' : '#94a3b8',
        cursor: pending ? 'wait' : 'pointer',
        fontSize: '0.85rem',
        padding: '0.25rem 0.4rem',
        lineHeight: 1,
      }}
    >
      ✕
    </button>
  );
}
