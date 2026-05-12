import { redirect } from 'next/navigation';

import {
  cardHeadingStyle,
  cardStyle,
  mutedStyle,
  PageShell,
  tableStyle,
  tdStyle,
  thStyle,
} from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { listUsers } from '@/lib/admin/actions';

import { InviteForm, ResyncButton } from './actions';

export const metadata = { title: 'Admin — speediance-platform' };

export default async function AdminPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const users = await listUsers();

  return (
    <PageShell current="admin" userLabel={String(claims.email ?? claims.sub)} title="Admin">
      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Resync</h2>
        <p style={mutedStyle}>
          Trigger a sync of your Speediance training history right now (instead of waiting for the
          10:00&nbsp;UTC cron). Runs async — refresh the dashboard ~30 seconds later.
        </p>
        <div style={{ marginTop: '0.9rem' }}>
          <ResyncButton />
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Invite a family member</h2>
        <p style={mutedStyle}>
          Creates a Cognito user with a temporary password and emails the invite. The new user goes
          through the same MFA setup flow on first sign-in.
        </p>
        <div style={{ marginTop: '0.9rem' }}>
          <InviteForm />
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Users</h2>
        <p style={mutedStyle}>Everyone in the Cognito pool.</p>
        <table style={{ ...tableStyle, marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Enabled</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={4}>
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.username}>
                <td style={tdStyle}>{u.email ?? u.username}</td>
                <td
                  style={{
                    ...tdStyle,
                    color: u.status === 'CONFIRMED' ? '#0d9488' : '#a06000',
                  }}
                >
                  {u.status}
                </td>
                <td style={{ ...tdStyle, color: u.enabled ? '#0d9488' : '#dc2626' }}>
                  {u.enabled ? 'yes' : 'no'}
                </td>
                <td style={{ ...tdStyle, color: '#666' }}>
                  {u.createdAt ? u.createdAt.slice(0, 10) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
