'use client';

import { useState, useTransition } from 'react';

import { askCoach, type CoachMessage } from '@/lib/coach/actions';

export function CoachChat() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: question }]);
    startTransition(async () => {
      const res = await askCoach(messages, question);
      if (!res.ok) {
        setError(res.message);
        // Roll back the user message so they can retry with the same input.
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

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '120px' }}>
        {messages.length === 0 && !pending && (
          <p style={{ color: '#888', margin: 0 }}>
            Say something to get started — try one of the prompts below.
          </p>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} m={m} />
        ))}
        {pending && <div style={{ ...bubbleAssistant, color: '#888' }}>Thinking…</div>}
        {error && (
          <div
            style={{
              padding: '0.6rem 0.8rem',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#b91c1c',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          type="text"
          name="question"
          placeholder="Ask the coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          style={{
            flex: 1,
            padding: '0.55rem 0.75rem',
            border: '1px solid #d0d0d0',
            borderRadius: '6px',
            fontSize: '0.95rem',
          }}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          style={{
            padding: '0.55rem 1.1rem',
            background: pending ? '#88b8e0' : '#0b78d1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: pending ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: '0.95rem',
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
      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
      {m.toolsUsed && m.toolsUsed.length > 0 && (
        <div style={{ marginTop: '0.4rem', color: '#888', fontSize: '0.75rem' }}>
          tools: {m.toolsUsed.join(', ')}
        </div>
      )}
    </div>
  );
}

const bubbleBase: React.CSSProperties = {
  padding: '0.6rem 0.9rem',
  borderRadius: '10px',
  maxWidth: '85%',
  fontSize: '0.95rem',
};

const bubbleUser: React.CSSProperties = {
  ...bubbleBase,
  background: '#0b78d1',
  color: 'white',
  alignSelf: 'flex-end',
  marginLeft: 'auto',
};

const bubbleAssistant: React.CSSProperties = {
  ...bubbleBase,
  background: '#f1f4f8',
  color: '#1a1a1a',
  alignSelf: 'flex-start',
};
