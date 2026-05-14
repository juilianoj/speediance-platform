'use client';

/**
 * Nav button that opens the ambient assistant drawer. The drawer itself
 * subscribes to a `spd-assistant-open` window event, so this button can
 * live in the (server-rendered) Nav without sharing React state with the
 * drawer component.
 */
export function AssistantButton() {
  const open = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('spd-assistant-open'));
  };
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open assistant"
      title="Ask the assistant"
      style={{
        padding: '0.35rem 0.75rem',
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
        color: 'var(--text-on-accent)',
        border: 'none',
        borderRadius: '999px',
        fontSize: '0.82rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        boxShadow: '0 2px 6px rgba(11,120,209,0.25)',
      }}
    >
      <span aria-hidden="true">✦</span>
      <span>Ask</span>
    </button>
  );
}
