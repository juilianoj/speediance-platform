import { cardHeadingStyle, cardStyle, mutedStyle } from '@/app/(authed)/page-shell';
import { listNotes } from '@/lib/notes/actions';

import { AddNoteForm, DeleteNoteButton } from './notes-section.client';

interface Props {
  targetType: 'workout' | 'exercise';
  targetId: string;
  /** Short noun for the empty-state copy — "this workout", "this exercise". */
  label: string;
}

/**
 * Server-rendered notes card. Drop it onto any detail page that has a
 * stable (workout startTime / exerciseId) — it'll fetch the notes for
 * that target, render the timeline, and supply an add form.
 *
 * Mutations route through `lib/notes/actions.ts`, which calls
 * `revalidatePath()` so the new / removed note appears without a manual
 * page refresh.
 */
export async function NotesSection({ targetType, targetId, label }: Props) {
  const notes = await listNotes(targetType, targetId);

  return (
    <section style={cardStyle}>
      <h2 style={cardHeadingStyle}>Notes</h2>
      <p style={mutedStyle}>
        Anything you want to remember about {label} — form cues, how it felt, what to try next.
      </p>

      <AddNoteForm targetType={targetType} targetId={targetId} />

      {notes.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', margin: '1rem 0 0 0', fontSize: '0.9rem' }}>
          No notes yet. Add the first one above.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '1rem 0 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
          }}
        >
          {notes.map((n) => (
            <li
              key={n.createdAt}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.7rem 0.85rem',
                background: 'var(--bg-subtle)',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '0.6rem',
                alignItems: 'start',
              }}
            >
              <div>
                <div
                  style={{
                    color: 'var(--text-faint)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.25rem',
                  }}
                >
                  {formatTimestamp(n.createdAt)}
                </div>
                <div
                  style={{
                    fontSize: '0.93rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text)',
                  }}
                >
                  {n.body}
                </div>
              </div>
              <DeleteNoteButton
                targetType={targetType}
                targetId={targetId}
                createdAt={n.createdAt}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  let h = d.getHours();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${m} ${d.getDate()} · ${h}:${min}${ampm}`;
}
