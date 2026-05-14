'use client';

import { useState, useTransition } from 'react';

import { createMobilityDraft } from '@/lib/builder/actions';
import type { RecoveryWarning } from '@/lib/data/load-recovery-warnings';

/**
 * Recovery-day prompt (roadmap §3.3). Surfaces above the dashboard KPI
 * strip when the user has 3+ consecutive lift days scheduled in the
 * next two weeks. One-click "Create mobility draft" scaffolds a
 * recovery WorkoutDraft they can then fill in via /builder or via the
 * coach.
 */
export function RecoveryBanner({ warnings }: { warnings: RecoveryWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div style={{ marginBottom: '1.25rem', display: 'grid', gap: '0.6rem' }}>
      {warnings.map((w) => (
        <RecoveryRow key={`${w.startDate}-${w.count}`} warning={w} />
      ))}
    </div>
  );
}

function RecoveryRow({ warning }: { warning: RecoveryWarning }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message?: string; draftId?: string } | null>(
    null,
  );

  const onClick = () =>
    startTransition(async () => {
      const res = await createMobilityDraft(warning.suggestedInsertDate);
      setStatus(res);
      if (res.ok && res.draftId) {
        window.location.href = `/builder/${res.draftId}`;
      }
    });

  return (
    <section style={bannerStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>
          {warning.count} consecutive lift days scheduled
          <span style={dateRangeStyle}>
            {' · '}
            {fmt(warning.startDate)} → {fmt(warning.endDate)}
          </span>
        </div>
        <p style={bodyStyle}>
          Consider inserting a mobility / recovery session around{' '}
          <strong>{fmt(warning.suggestedInsertDate)}</strong> to give connective tissue a break. One
          click below scaffolds a draft you can fill in (or ask the coach to fill).
        </p>
        {status && !status.ok && (
          <p style={{ margin: '0.4rem 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>
            {status.message ?? 'Could not scaffold the draft.'}
          </p>
        )}
      </div>
      <button type="button" onClick={onClick} disabled={pending} style={ctaStyle(pending)}>
        {pending ? 'Creating…' : 'Create mobility draft'}
      </button>
    </section>
  );
}

function fmt(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${dow} ${m} ${d.getUTCDate()}`;
}

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '1rem 1.2rem',
  border: '1px solid #fde68a',
  background: 'var(--warning-bg)',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--warning-text)',
};

const dateRangeStyle: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--warning-text)',
};

const bodyStyle: React.CSSProperties = {
  margin: '0.3rem 0 0',
  fontSize: '0.88rem',
  color: 'var(--warning-text)',
};

function ctaStyle(pending: boolean): React.CSSProperties {
  return {
    padding: '0.55rem 1rem',
    background: pending ? 'var(--border-strong)' : 'var(--warning-text)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: pending ? 'wait' : 'pointer',
    whiteSpace: 'nowrap',
  };
}
