'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { getMyLastSyncedAt, resyncMe } from '@/lib/admin/actions';

/**
 * "Last refreshed X ago" banner with a Refresh-now button. Sits above the
 * dashboard KPI strip so users see how fresh the data is and can pull a
 * manual sync without digging into /admin.
 *
 * Sync mechanics: the Refresh button fires an async Lambda invoke
 * (returns immediately) and then *polls* for `lastSyncedAt` to change.
 * The full first-time history sync can take 1–3 minutes, so a fixed
 * sleep+refresh would either give up too early (showing "Hasn't synced
 * yet" indefinitely) or block the UI for too long.
 */
export function SyncBanner({ lastSyncedAt }: { lastSyncedAt?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  const subtitle = lastSyncedAt
    ? `Last refreshed ${relativeTime(lastSyncedAt)} · ${absoluteTime(lastSyncedAt)}`
    : 'Last sync time unknown — refresh to start tracking it.';

  return (
    <div style={containerStyle}>
      <div style={textStyle}>
        <div style={titleStyle}>Speediance data</div>
        <div style={subtitleStyle}>{progress ?? subtitle}</div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const before = lastSyncedAt ?? null;
            setProgress('Sync started — pulling your Speediance history…');
            await resyncMe();
            // Poll every 4s up to 3 minutes — the first run on a populated
            // user can pull 5+ years of records.
            const start = Date.now();
            const maxMs = 3 * 60 * 1000;
            while (Date.now() - start < maxMs) {
              await new Promise((r) => setTimeout(r, 4000));
              const { lastSyncedAt: now } = await getMyLastSyncedAt();
              if (now && now !== before) {
                setProgress('Done — updating dashboard…');
                router.refresh();
                // Give the route a moment to start re-fetching, then clear
                // local state so the rendered subtitle takes over.
                setTimeout(() => setProgress(null), 1500);
                return;
              }
            }
            // Timed out — sync may still be running, but stop waiting.
            setProgress('Still syncing — refresh the page in a minute.');
            setTimeout(() => setProgress(null), 6000);
          });
        }}
        style={buttonStyle(pending)}
      >
        {pending ? 'Refreshing…' : 'Refresh now'}
      </button>
    </div>
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  // After a month relative is useless; fall back to absolute.
  return absoluteTime(iso);
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const hr = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = hr >= 12 ? 'pm' : 'am';
  const hr12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} at ${hr12}:${min}${ampm}`;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.85rem 1.1rem',
  border: '1px solid var(--border)',
  background: 'var(--accent-soft)',
  borderRadius: '12px',
  marginBottom: '1.25rem',
};

const textStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--accent)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.92rem',
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function buttonStyle(pending: boolean): React.CSSProperties {
  return {
    padding: '0.55rem 1rem',
    fontSize: '0.88rem',
    fontWeight: 600,
    background: pending
      ? 'var(--text-faint)'
      : 'linear-gradient(135deg, #22d3ee 0%, var(--accent) 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: pending ? 'wait' : 'pointer',
    flex: '0 0 auto',
    boxShadow: pending ? 'none' : '0 2px 6px rgba(11,120,209,0.25)',
  };
}
