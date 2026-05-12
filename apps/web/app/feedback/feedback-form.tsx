'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { submitFeedback, type FeedbackResult } from '@/lib/feedback/actions';

export function FeedbackForm() {
  const [result, action] = useFormState<FeedbackResult | null, FormData>(submitFeedback, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form on a successful submission so the next message isn't
  // prefilled with the last one.
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result?.ok]);

  return (
    <form ref={formRef} action={action} style={formStyle}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, flex: '0 0 180px' }}>
          <span style={spanStyle}>Category</span>
          <select name="category" defaultValue="suggestion" style={inputStyle}>
            <option value="bug">Bug</option>
            <option value="feature">Feature request</option>
            <option value="suggestion">Suggestion</option>
            <option value="question">Question</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 240px' }}>
          <span style={spanStyle}>Subject</span>
          <input
            name="subject"
            type="text"
            required
            minLength={3}
            maxLength={200}
            placeholder="Short summary"
            style={inputStyle}
          />
        </label>
      </div>
      <label style={labelStyle}>
        <span style={spanStyle}>Details</span>
        <textarea
          name="body"
          required
          minLength={5}
          maxLength={5000}
          rows={5}
          placeholder="What happened, what you want, or what's confusing…"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>
      {result && (
        <p
          style={{
            margin: 0,
            padding: '0.6rem 0.8rem',
            background: result.ok ? '#ecfdf5' : '#fef2f2',
            border: '1px solid',
            borderColor: result.ok ? '#a7f3d0' : '#fecaca',
            color: result.ok ? '#065f46' : '#b91c1c',
            borderRadius: '8px',
            fontSize: '0.88rem',
          }}
        >
          {result.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '0.65rem 1.2rem',
        background: pending ? '#cbd5e1' : 'linear-gradient(135deg, #0b78d1 0%, #0b5fa8 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '10px',
        cursor: pending ? 'wait' : 'pointer',
        fontWeight: 700,
        fontSize: '0.92rem',
        boxShadow: pending ? 'none' : '0 4px 12px rgba(11,120,209,0.30)',
        alignSelf: 'flex-start',
      }}
    >
      {pending ? 'Sending…' : 'Send feedback'}
    </button>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
  marginTop: '0.85rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

const spanStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#64748b',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  fontSize: '0.92rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  background: '#fff',
  color: '#0f172a',
  outline: 'none',
};
