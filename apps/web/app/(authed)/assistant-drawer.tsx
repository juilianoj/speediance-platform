'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { askCoach, type CoachMessage } from '@/lib/coach/actions';
import { type ProposedAction } from '@/lib/coach/plan';
import { executePlan } from '@/lib/coach/plan-actions';

const SUGGESTED_PROMPTS = [
  'What did I do yesterday?',
  'What should I do today?',
  'Plan me a push day.',
  'Which muscle group have I been neglecting?',
];

const STORAGE_OPEN = 'spd-asst-open';
const STORAGE_HISTORY = 'spd-asst-history';
const HISTORY_LIMIT = 50; // bound localStorage size

/**
 * Ambient AI assistant drawer. Mounts on every authed page via the
 * PageShell. Slide-out from the right (mobile: full-screen overlay).
 *
 * Open / closed state and conversation history persist via localStorage
 * so navigating between pages doesn't drop the chat — important for the
 * agentic use case where the assistant is mid-conversation about "plan
 * me a push day" and the user clicks /builder to see something.
 *
 * Plan-and-confirm flow lives in a later PR (β). For now the chat is
 * the same one /coach has used — every tool call still executes
 * immediately on the server side.
 */
export function AssistantDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Hydrate persisted state on mount. Skip during server render.
  useEffect(() => {
    try {
      const storedOpen = localStorage.getItem(STORAGE_OPEN) === '1';
      setOpen(storedOpen);
      const raw = localStorage.getItem(STORAGE_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw) as CoachMessage[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-HISTORY_LIMIT));
      }
    } catch {
      // localStorage can throw in private-browsing mode — fine, drawer
      // starts closed with no history.
    }
  }, []);

  // Persist on change. JSON serialization keeps things simple; capping
  // the rolling window keeps localStorage well under its 5MB limit even
  // after long sessions.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(messages.slice(-HISTORY_LIMIT)));
    } catch {
      // Quota exceeded — drop the oldest half and try again. If still
      // failing, give up silently.
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_OPEN, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [open]);

  // Listen for "open the drawer" events from anywhere in the app.
  // The nav button dispatches this so it can live in the (server) Nav
  // without needing direct access to drawer state.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener('spd-assistant-open', onOpen);
    window.addEventListener('spd-assistant-toggle', onToggle);
    return () => {
      window.removeEventListener('spd-assistant-open', onOpen);
      window.removeEventListener('spd-assistant-toggle', onToggle);
    };
  }, []);

  // Escape closes. Standard drawer affordance.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const submit = (question: string) => {
    if (!question.trim()) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: question }]);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof askCoach>> | undefined;
      try {
        res = await askCoach(messagesRef.current, question);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Coach request failed before reaching the server.';
        setError(message);
        setMessages((m) => m.slice(0, -1));
        setInput(question);
        return;
      }
      if (!res || !res.ok) {
        setError(
          res?.ok === false
            ? res.message
            : 'Coach request timed out. Try a narrower prompt or ask again.',
        );
        setMessages((m) => m.slice(0, -1));
        setInput(question);
        return;
      }
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.reply,
          toolsUsed: res.toolsUsed,
          proposedActions: res.proposedActions,
          planStatus: (res.proposedActions ?? []).length > 0 ? 'pending' : undefined,
        },
      ]);
    });
  };

  // Approve every queued action for one assistant message. Updates the
  // message in-place with status + per-step results.
  const approvePlan = (messageIdx: number, actions: ProposedAction[]) => {
    setMessages((m) =>
      m.map((msg, i) => (i === messageIdx ? { ...msg, planStatus: 'running' } : msg)),
    );
    startTransition(async () => {
      try {
        const res = await executePlan(actions);
        setMessages((m) =>
          m.map((msg, i) =>
            i === messageIdx
              ? {
                  ...msg,
                  planStatus: res.ok ? 'done' : 'failed',
                  planResults: res.results.map((r) => ({
                    id: r.id,
                    ok: r.ok,
                    error: r.error,
                  })),
                }
              : msg,
          ),
        );
      } catch (err) {
        setMessages((m) =>
          m.map((msg, i) => {
            if (i !== messageIdx) return msg;
            const message = err instanceof Error ? err.message : 'Plan execution failed.';
            return {
              ...msg,
              planStatus: 'failed',
              planResults: actions.map((a) => ({ id: a.id, ok: false, error: message })),
            };
          }),
        );
      }
    });
  };

  const cancelPlan = (messageIdx: number) => {
    setMessages((m) =>
      m.map((msg, i) => (i === messageIdx ? { ...msg, planStatus: 'cancelled' } : msg)),
    );
  };

  const clear = () => {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_HISTORY);
    } catch {
      // ignore
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input.trim());
  };

  // Don't render the drawer at all when closed — it stays out of tab
  // order and accessibility tree. The toggle button in the nav (and
  // wherever else we surface it) handles open.
  if (!open) return null;

  return (
    <>
      {/* Backdrop — mobile only via media query in the styles below */}
      <div onClick={() => setOpen(false)} style={backdropStyle} aria-hidden="true" />

      <aside role="dialog" aria-label="Speediance assistant" style={drawerStyle}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
              Assistant
            </span>
            <span style={badgeStyle}>BETA</span>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                style={iconButtonStyle}
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={iconButtonStyle}
              aria-label="Close assistant"
              title="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div style={bodyStyle}>
          {messages.length === 0 && !pending && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={primerStyle}>
                Ask anything about your training, or have the assistant draft + schedule workouts
                for you.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => submit(p)}
                    disabled={pending}
                    style={chipStyle}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Bubble m={m} />
              {m.role === 'assistant' && m.proposedActions && m.proposedActions.length > 0 && (
                <PlanCard
                  actions={m.proposedActions}
                  status={m.planStatus ?? 'pending'}
                  results={m.planResults}
                  pending={pending}
                  onApprove={() => approvePlan(i, m.proposedActions ?? [])}
                  onCancel={() => cancelPlan(i)}
                />
              )}
            </div>
          ))}
          {pending && (
            <div style={{ ...bubbleAssistant, color: 'var(--text-faint)' }}>Thinking…</div>
          )}
          {error && (
            <div style={errorStyle}>
              <strong style={{ display: 'block', marginBottom: '0.2rem' }}>Couldn’t finish</strong>
              {error}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} style={formStyle}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your training…"
            disabled={pending}
            autoFocus
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            style={submitButtonStyle(pending)}
            aria-label={pending ? 'Sending…' : 'Send message'}
            title="Send"
          >
            {pending ? (
              '…'
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            )}
          </button>
        </form>
      </aside>
    </>
  );
}

/**
 * Plan card — surfaces the queued write actions after every turn the
 * assistant decided to do something. One Approve button runs every
 * action in order; Cancel drops the whole plan. Per-action results
 * show inline after the run so partial failures are visible.
 */
function PlanCard({
  actions,
  status,
  results,
  pending,
  onApprove,
  onCancel,
}: {
  actions: ProposedAction[];
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  results?: Array<{ id: string; ok: boolean; error?: string }>;
  pending: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const resultById = new Map((results ?? []).map((r) => [r.id, r]));
  const statusBanner = (() => {
    switch (status) {
      case 'running':
        return { color: 'var(--accent)', label: 'Running…' };
      case 'done':
        return { color: 'var(--success)', label: '✓ Approved & executed' };
      case 'failed':
        return { color: 'var(--danger)', label: 'Some steps failed — see details' };
      case 'cancelled':
        return { color: 'var(--text-faint)', label: 'Cancelled — nothing was saved' };
      case 'pending':
      default:
        return { color: 'var(--warning)', label: 'Awaiting approval' };
    }
  })();

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft:
          status === 'done'
            ? '3px solid var(--success)'
            : status === 'failed'
              ? '3px solid var(--danger)'
              : status === 'cancelled'
                ? '3px solid var(--text-faint)'
                : '3px solid var(--accent)',
        borderRadius: '10px',
        background: 'var(--bg-card)',
        padding: '0.7rem 0.85rem',
        fontSize: '0.85rem',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-card-sm)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.45rem',
        }}
      >
        <strong
          style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Plan ({actions.length} step{actions.length === 1 ? '' : 's'})
        </strong>
        <span style={{ color: statusBanner.color, fontSize: '0.75rem', fontWeight: 600 }}>
          {statusBanner.label}
        </span>
      </div>
      <ol style={{ margin: 0, padding: '0 0 0 1.2rem', display: 'grid', gap: '0.25rem' }}>
        {actions.map((a) => {
          const r = resultById.get(a.id);
          const stepColor = r ? (r.ok ? 'var(--success)' : 'var(--danger)') : 'var(--text)';
          return (
            <li key={a.id} style={{ color: stepColor, lineHeight: 1.45 }}>
              {a.summary}
              {r && !r.ok && r.error && (
                <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}> — {r.error}</span>
              )}
            </li>
          );
        })}
      </ol>
      {status === 'pending' && (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: '7px',
              fontWeight: 600,
              cursor: pending ? 'wait' : 'pointer',
              fontSize: '0.82rem',
            }}
          >
            Approve & run
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-strong)',
              borderRadius: '7px',
              fontSize: '0.82rem',
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  const isUser = m.role === 'user';
  return (
    <div style={isUser ? bubbleUser : bubbleAssistant}>
      {isUser ? (
        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
      ) : (
        <div style={{ lineHeight: 1.5 }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                  {...(href?.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {children}
                </a>
              ),
              p: ({ children }) => <p style={{ margin: '0 0 0.4rem 0' }}>{children}</p>,
              ul: ({ children }) => (
                <ul style={{ margin: '0 0 0.4rem 1.1rem', padding: 0 }}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol style={{ margin: '0 0 0.4rem 1.4rem', padding: 0 }}>{children}</ol>
              ),
              table: ({ children }) => (
                <table
                  style={{ borderCollapse: 'collapse', margin: '0.3rem 0', fontSize: '0.85rem' }}
                >
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th
                  style={{
                    padding: '0.25rem 0.4rem',
                    borderBottom: '1px solid var(--border-strong)',
                    textAlign: 'left',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderBottom: '1px solid var(--border-faint)',
                    verticalAlign: 'top',
                  }}
                >
                  {children}
                </td>
              ),
              code: ({ children }) => (
                <code
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: '0.05rem 0.3rem',
                    borderRadius: '3px',
                    fontSize: '0.85em',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  {children}
                </code>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
      )}
      {m.toolsUsed && m.toolsUsed.length > 0 && (
        <div
          style={{
            marginTop: '0.35rem',
            color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)',
            fontSize: '0.7rem',
          }}
        >
          tools: {m.toolsUsed.join(', ')}
        </div>
      )}
    </div>
  );
}

// ─── styles ────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 440;

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 49,
  // Hidden on desktop; only the actual drawer covers content there.
  // Using a `pointer-events: none` baseline + media-query override
  // can't be done inline, so we rely on the drawer's own width offset
  // on wide screens and let the backdrop stack on narrow.
};

const drawerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: DRAWER_WIDTH,
  background: 'var(--bg-card)',
  borderLeft: '1px solid var(--border)',
  boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  flex: '0 0 auto',
};

const badgeStyle: React.CSSProperties = {
  padding: '0.1rem 0.45rem',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'var(--accent)',
  background: 'var(--accent-soft)',
  borderRadius: '999px',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  borderRadius: '6px',
  padding: '0.25rem 0.55rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
};

const bodyStyle: React.CSSProperties = {
  padding: '1rem',
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
};

const primerStyle: React.CSSProperties = {
  margin: '0 0 0.6rem 0',
  color: 'var(--text-muted)',
  fontSize: '0.88rem',
  lineHeight: 1.45,
};

const chipStyle: React.CSSProperties = {
  padding: '0.4rem 0.7rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '999px',
  background: 'var(--bg-card)',
  color: 'var(--text)',
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const bubbleBase: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: '12px',
  maxWidth: '92%',
  fontSize: '0.9rem',
  lineHeight: 1.45,
};

const bubbleUser: React.CSSProperties = {
  ...bubbleBase,
  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
  color: 'var(--text-on-accent)',
  alignSelf: 'flex-end',
  marginLeft: 'auto',
};

const bubbleAssistant: React.CSSProperties = {
  ...bubbleBase,
  background: 'var(--bg-subtle)',
  color: 'var(--text)',
  alignSelf: 'flex-start',
  border: '1px solid var(--border)',
};

const errorStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  borderRadius: '8px',
  color: 'var(--danger)',
  fontSize: '0.85rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
  borderTop: '1px solid var(--border)',
  flex: '0 0 auto',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.55rem 0.75rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '10px',
  fontSize: '0.92rem',
  color: 'var(--text)',
  background: 'var(--bg-input)',
  outline: 'none',
};

function submitButtonStyle(pending: boolean): React.CSSProperties {
  return {
    width: '38px',
    height: '38px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: pending
      ? 'var(--border-strong)'
      : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
    color: 'var(--text-on-accent)',
    border: 'none',
    borderRadius: '10px',
    cursor: pending ? 'wait' : 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    padding: 0,
  };
}
