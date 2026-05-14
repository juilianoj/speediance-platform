'use client';

import { useState, useTransition } from 'react';

import { generateMcpKey, revokeMcpKey } from '@/lib/profile/actions';

interface Props {
  /** Display-safe prefix of the user's current key, e.g. "spd_abcdef12".
   *  When absent, the UI says "No active key" and offers Generate. */
  initialPrefix?: string;
}

/**
 * `/profile` widget for the MCP API key. Lives in its own client
 * component because the rest of /profile is a `<form action={}>` Server
 * Action, and we don't want a key generation to be triggered by the
 * profile-save flow.
 *
 * Copy-on-generate UX: the full key is shown ONCE, in a banner with a
 * "Copy" button. Once the user clicks "I've copied it" the full key is
 * scrubbed from component state and the banner collapses to the
 * prefix-only display. There's no way to retrieve the value later —
 * losing it means generating a new one (which revokes the old).
 */
export function McpKeyCard({ initialPrefix }: Props) {
  const [prefix, setPrefix] = useState<string | undefined>(initialPrefix || undefined);
  // `freshKey` is non-null only between "Generate" and "I've copied it".
  // We intentionally don't persist it anywhere else.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const onGenerate = () => {
    startTransition(async () => {
      setError(null);
      setCopied(false);
      const result = await generateMcpKey();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFreshKey(result.key);
      setPrefix(result.prefix);
    });
  };

  const onRevoke = () => {
    if (
      !confirm(
        'Revoke your MCP API key? Claude Desktop will stop working until you generate a new one.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await revokeMcpKey();
      if (!result.ok) {
        setError(result.message ?? 'Revoke failed.');
        return;
      }
      setPrefix(undefined);
      setFreshKey(null);
    });
  };

  const onCopy = async () => {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      // clipboard write can fail in non-secure contexts; the user can
      // still select-and-copy from the input.
      setCopied(false);
    }
  };

  const onAcknowledge = () => {
    // Scrub the in-memory value so it can't be retrieved from devtools.
    setFreshKey(null);
    setCopied(false);
  };

  return (
    <div>
      <header style={{ marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>MCP API key (remote Claude Desktop)</strong>
        <p style={{ margin: '0.3rem 0 0 0', color: '#666', fontSize: '0.85rem' }}>
          Generate a key, paste it into Claude Desktop&apos;s <code>mcpServers</code> config, and
          you can chat with your training data from anywhere — not just the laptop you installed the
          local MCP server on. See{' '}
          <a href="https://github.com/juilianoj/speediance-platform/tree/main/mcp-server#remote-http-mode">
            docs
          </a>{' '}
          for the snippet.
        </p>
      </header>

      {freshKey ? (
        <div style={banner('success')}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
            New key minted — copy it now. After you click &quot;I&apos;ve copied it&quot; this value
            will never be shown again.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              readOnly
              value={freshKey}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...keyInputStyle, flex: 1 }}
            />
            <button type="button" onClick={onCopy} style={primaryButtonStyle}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={onAcknowledge}
            style={{ ...primaryButtonStyle, background: '#0d9488' }}
          >
            I&apos;ve copied it
          </button>
        </div>
      ) : prefix ? (
        <div style={banner('neutral')}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            Active key: <code>{prefix}…</code>
          </p>
        </div>
      ) : (
        <div style={banner('neutral')}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
            No active MCP key. Generate one to use Claude Desktop remotely.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onGenerate} disabled={pending} style={primaryButtonStyle}>
          {pending ? '…' : prefix ? 'Rotate (generate new, revoke old)' : 'Generate key'}
        </button>
        {prefix && (
          <button type="button" onClick={onRevoke} disabled={pending} style={danger}>
            Revoke
          </button>
        )}
      </div>

      {error && (
        <p style={{ marginTop: '0.5rem', color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>
      )}
    </div>
  );
}

function banner(kind: 'success' | 'neutral'): React.CSSProperties {
  return {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    background: kind === 'success' ? '#ecfdf5' : '#f7f7f8',
    border: `1px solid ${kind === 'success' ? '#a7f3d0' : '#e5e7eb'}`,
    fontSize: '0.9rem',
  };
}

const keyInputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.85rem',
  border: '1px solid #d0d0d0',
  borderRadius: '6px',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: '#0b78d1',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.85rem',
  whiteSpace: 'nowrap',
};

const danger: React.CSSProperties = {
  ...primaryButtonStyle,
  background: '#dc2626',
};
