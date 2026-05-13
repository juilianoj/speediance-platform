'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { resyncMe } from '@/lib/admin/actions';

/**
 * "Last refreshed X ago" banner with a Refresh-now button. Sits above the
 * dashboard KPI strip so users immediately see how fresh the data is and
 * can pull a manual sync without digging into /admin.
 */
export function SyncBanner({ lastSyncedAt }: { lastSyncedAt?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const subtitle = lastSyncedAt
    ? `Last refreshed ${relativeTime(lastSyncedAt)} · ${absoluteTime(lastSyncedAt)}`
    : "Hasn't synced yet — refresh to pull your latest Speediance history.";

  return (
    <div style={containerStyle}>
      <div style={textStyle}>
        <div style={titleStyle}>Speediance data</div>
        <div style={subtitleStyle}>{subtitle}</div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await resyncMe();
            // Server Action returns immediately (async invoke); the sync runs
            // in the background. Wait a beat, then re-fetch.
            await new Promise((r) => setTimeout(r, 1500));
            router.refresh();
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
  border: '1px solid #e0e7ff',
  background: 'linear-gradient(135deg, #f5f8ff 0%, #fafbff 100%)',
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
  color: '#1e3a8a',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.92rem',
  color: '#334155',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function buttonStyle(pending: boolean): React.CSSProperties {
  return {
    padding: '0.55rem 1rem',
    fontSize: '0.88rem',
    fontWeight: 600,
    background: pending ? '#94a3b8' : 'linear-gradient(135deg, #22d3ee 0%, #0b78d1 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: pending ? 'wait' : 'pointer',
    flex: '0 0 auto',
    boxShadow: pending ? 'none' : '0 2px 6px rgba(11,120,209,0.25)',
  };
}
