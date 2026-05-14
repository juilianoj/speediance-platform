'use client';

import { useRef, useState, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { askCoach, type CoachMessage } from '@/lib/coach/actions';

const SUGGESTED_PROMPTS = [
  'When did I last train chest?',
  'What is my best bench press?',
  'How was last week compared to the week before?',
  'Which muscle group have I been neglecting?',
  'Plan me a push day based on my last few sessions.',
];

export function CoachChat() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const submit = (question: string) => {
    if (!question.trim()) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: question }]);
    startTransition(async () => {
      // Use the ref so we capture any messages added since startTransition began.
      // res can be undefined when the upstream request times out (CloudFront 504)
      // or the action throws — guard so the chat shows an error instead of
      // crashing with "Cannot read properties of undefined".
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
        { role: 'assistant', content: res.reply, toolsUsed: res.toolsUsed },
      ]);
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input.trim());
  };

  return (
    <div>
      {/* Suggestion chips show when chat is empty — click to auto-submit. */}
      {messages.length === 0 && !pending && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}
        >
          <span style={chipsHeadingStyle}>Try asking</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
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

      {(messages.length > 0 || pending) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.7rem',
            padding: '0.85rem',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            marginBottom: '1rem',
          }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} m={m} />
          ))}
          {pending && <div style={{ ...bubbleAssistant, color: '#94a3b8' }}>Thinking…</div>}
        </div>
      )}

      {/* Errors render inline above the input — no chat-bubble container,
          no minHeight, no awkward empty space when there are no messages. */}
      {error && (
        <div
          style={{
            padding: '0.6rem 0.85rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#b91c1c',
            fontSize: '0.88rem',
            marginBottom: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.55rem' }}>
        <input
          type="text"
          name="question"
          placeholder="Ask anything about your training…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          autoFocus
          style={{
            flex: 1,
            padding: '0.65rem 0.9rem',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            fontSize: '0.95rem',
            color: '#0f172a',
            outline: 'none',
            background: '#fff',
          }}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          style={{
            padding: '0.65rem 1.3rem',
            background: pending ? '#cbd5e1' : 'linear-gradient(135deg, #0b78d1 0%, #0b5fa8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: pending ? 'wait' : 'pointer',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxShadow: pending ? 'none' : '0 4px 12px rgba(11,120,209,0.30)',
          }}
        >
          {pending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  const isUser = m.role === 'user';
  return (
    <div style={isUser ? bubbleUser : bubbleAssistant}>
      {isUser ? (
        // User messages are plain text — what they typed is what they meant.
        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
      ) : (
        // Coach messages may contain markdown — links to /builder draftIds,
        // bold for emphasis, tables for set/rep summaries. Render them.
        <div style={assistantMarkdownStyle}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  style={{ color: '#0b78d1', textDecoration: 'underline' }}
                  // Internal /builder links should stay in-tab; offsite
                  // shouldn't ever come from the coach, but be defensive.
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
                  style={{
                    borderCollapse: 'collapse',
                    margin: '0.3rem 0',
                    fontSize: '0.88rem',
                  }}
                >
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th
                  style={{
                    padding: '0.3rem 0.55rem',
                    borderBottom: '1px solid #cbd5e1',
                    textAlign: 'left',
                    color: '#475569',
                    fontWeight: 600,
                  }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td
                  style={{
                    padding: '0.25rem 0.55rem',
                    borderBottom: '1px solid #f1f5f9',
                    verticalAlign: 'top',
                  }}
                >
                  {children}
                </td>
              ),
              code: ({ children }) => (
                <code
                  style={{
                    background: '#f1f5f9',
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
            marginTop: '0.4rem',
            color: isUser ? 'rgba(255,255,255,0.7)' : '#94a3b8',
            fontSize: '0.72rem',
          }}
        >
          tools: {m.toolsUsed.join(', ')}
        </div>
      )}
    </div>
  );
}

const assistantMarkdownStyle: React.CSSProperties = {
  // Reset the default browser margins ReactMarkdown emits — bubbles look
  // tight by default, and the per-element overrides above handle spacing.
  lineHeight: 1.5,
};

const chipsHeadingStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const chipStyle: React.CSSProperties = {
  padding: '0.5rem 0.85rem',
  border: '1px solid #cbd5e1',
  borderRadius: '999px',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 120ms, background 120ms',
};

const bubbleBase: React.CSSProperties = {
  padding: '0.7rem 1rem',
  borderRadius: '12px',
  maxWidth: '85%',
  fontSize: '0.95rem',
  lineHeight: 1.45,
};

const bubbleUser: React.CSSProperties = {
  ...bubbleBase,
  background: 'linear-gradient(135deg, #0b78d1 0%, #0b5fa8 100%)',
  color: 'white',
  alignSelf: 'flex-end',
  marginLeft: 'auto',
  boxShadow: '0 2px 6px rgba(11,120,209,0.25)',
};

const bubbleAssistant: React.CSSProperties = {
  ...bubbleBase,
  background: '#ffffff',
  color: '#0f172a',
  alignSelf: 'flex-start',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
};
