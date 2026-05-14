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
import { getCatalogSize, listUsers } from '@/lib/admin/actions';
import { loadCoachSpendBreakdown } from '@/lib/admin/coach-spend';
import { COST_FLAG_THRESHOLD_USD, loadCostBreakdown } from '@/lib/admin/cost';
import { listAllFeedback } from '@/lib/feedback/actions';

import {
  CatalogRebuildButton,
  HardDeleteUserButton,
  InviteForm,
  ResyncButton,
  UserEnabledToggle,
} from './actions';

export const metadata = { title: 'Admin — speediance-platform' };

export default async function AdminPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');
  const [users, feedback, catalogSize, cost] = await Promise.all([
    listUsers(),
    listAllFeedback(),
    getCatalogSize(),
    loadCostBreakdown(),
  ]);
  // Coach spend depends on the user list, so it runs after.
  const coachSpend = await loadCoachSpendBreakdown(users.map((u) => u.username));

  return (
    <PageShell current="admin" userLabel={String(claims.email ?? claims.sub)}>
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
        <h2 style={cardHeadingStyle}>Exercise catalog</h2>
        <p style={mutedStyle}>
          Cached snapshot of Speediance&rsquo;s action library — setup instructions, cable position,
          accessories, muscle groups. Rebuild when Speediance adds new exercises or updates the
          library. Runs async via the sync worker (~3-5 min for ~500 exercises).
        </p>
        <div style={{ marginTop: '0.9rem' }}>
          <CatalogRebuildButton currentSize={catalogSize.count} />
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
        <h2 style={cardHeadingStyle}>Feedback</h2>
        <p style={mutedStyle}>
          Everything users have submitted. Newest first. Status mutation is Phase 4.x.
        </p>
        {feedback.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '0.75rem 0 0 0' }}>None yet.</p>
        ) : (
          <table style={{ ...tableStyle, marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Subject</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <tr key={`${f.userId}-${f.createdAt}`}>
                  <td style={tdStyle}>{f.createdAt.slice(0, 10)}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {f.userEmail ?? f.userId.slice(0, 8)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{f.category}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{f.subject}</div>
                    {f.body && (
                      <div
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.82rem',
                          marginTop: '0.2rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {f.body}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{f.status ?? 'open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Coach spend (per user, month-to-date)</h2>
        <p style={mutedStyle}>
          Bedrock token usage logged from every assistant turn × published per-token prices. The
          variable chunk of AWS spend is almost entirely Bedrock at family scale, so this is the
          number to watch for runaway prompts. Anyone above ${coachSpend.flagThresholdUsd}/mo is
          flagged red.
        </p>
        {coachSpend.rows.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', margin: '0.75rem 0 0 0', fontSize: '0.85rem' }}>
            No coach turns logged this month yet.
          </p>
        ) : (
          <>
            <div
              style={{
                marginTop: '0.9rem',
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.6rem',
              }}
            >
              <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                ${coachSpend.totalUsd.toFixed(2)}
              </span>
              <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                across {coachSpend.totalTurns.toLocaleString()} turns · since{' '}
                {coachSpend.monthStart}
              </span>
            </div>
            <table style={{ ...tableStyle, marginTop: '0.75rem' }}>
              <thead>
                <tr>
                  <th style={thStyle}>User</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Turns</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>In tokens</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Out tokens</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Slowest</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Estimated $</th>
                </tr>
              </thead>
              <tbody>
                {coachSpend.rows.map((r) => {
                  const u = users.find((x) => x.username === r.userId);
                  const over = r.estimatedUsd > coachSpend.flagThresholdUsd;
                  return (
                    <tr key={r.userId}>
                      <td style={tdStyle}>{u?.email ?? r.userId.slice(0, 8)}</td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {r.turns} {r.successfulTurns < r.turns ? `(${r.successfulTurns} ok)` : ''}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {r.inputTokens.toLocaleString()}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {r.outputTokens.toLocaleString()}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          color: r.maxDurationMs > 45000 ? 'var(--warning)' : 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {(r.maxDurationMs / 1000).toFixed(1)}s
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: over ? 'var(--danger)' : 'var(--text)',
                          fontWeight: over ? 700 : 400,
                        }}
                      >
                        ${r.estimatedUsd.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Cost (month-to-date)</h2>
        <p style={mutedStyle}>
          AWS spend for this stage so far this month. Cost Explorer has a ~24-hour lag, so
          today&apos;s spend won&apos;t appear until tomorrow. Per-user attribution is not wired up
          — Lambda / DDB / Bedrock calls aren&apos;t tagged with userId.
        </p>
        {cost.ok ? (
          <div style={{ marginTop: '0.9rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.6rem',
                marginBottom: '0.75rem',
              }}
            >
              <span
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: cost.total > COST_FLAG_THRESHOLD_USD ? 'var(--danger)' : 'var(--text)',
                }}
              >
                ${cost.total.toFixed(2)}
              </span>
              <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                {cost.unit} · since {cost.monthStart}
              </span>
              {cost.total > COST_FLAG_THRESHOLD_USD && (
                <span
                  style={{
                    color: 'var(--danger)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginLeft: '0.6rem',
                  }}
                >
                  above ${COST_FLAG_THRESHOLD_USD} target
                </span>
              )}
            </div>
            {cost.lines.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', margin: 0, fontSize: '0.85rem' }}>
                No services have billed yet this month.
              </p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Service</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.lines.map((line) => (
                    <tr key={line.service}>
                      <td style={tdStyle}>{line.service}</td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        ${line.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--warning)', margin: '0.75rem 0 0 0', fontSize: '0.85rem' }}>
            {cost.reason}
          </p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeadingStyle}>Users</h2>
        <p style={mutedStyle}>
          Everyone in the Cognito pool. Disable suspends sign-in but keeps data. Delete is
          irreversible — removes the Cognito user, their Speediance secret, and their profile row.
          Workout history rows stay in DynamoDB.
        </p>
        <table style={{ ...tableStyle, marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Enabled</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={5}>
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const isSelf = u.username === claims.sub;
              return (
                <tr key={u.username}>
                  <td style={tdStyle}>{u.email ?? u.username}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: u.status === 'CONFIRMED' ? 'var(--success)' : 'var(--warning)',
                    }}
                  >
                    {u.status}
                  </td>
                  <td style={{ ...tdStyle, color: u.enabled ? 'var(--success)' : 'var(--danger)' }}>
                    {u.enabled ? 'yes' : 'no'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                    {u.createdAt ? u.createdAt.slice(0, 10) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <UserEnabledToggle
                        username={u.username}
                        enabled={u.enabled}
                        isSelf={isSelf}
                      />
                      <HardDeleteUserButton username={u.username} email={u.email} isSelf={isSelf} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
