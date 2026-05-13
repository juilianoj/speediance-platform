import 'server-only';

import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type Dimension,
  type Granularity,
} from '@aws-sdk/client-cost-explorer';

/**
 * Roadmap §4.7: surface this stage's current-month AWS spend on /admin so
 * we notice if a sync-loop bug or a coach prompt with a runaway tool chain
 * starts driving real money.
 *
 * Limitations of v1 (called out in the UI):
 *
 * - **Total spend only, not per-user.** Lambda invocations + DDB requests
 *   + Bedrock calls are not tagged with `userId`, so AWS Cost Explorer
 *   can't slice cost by user. Per-user attribution would require adding
 *   user-tagged invocations + activating user-defined cost-allocation
 *   tags in Billing — meaningful but out of scope here.
 * - **24-hour lag.** Cost Explorer is eventually consistent; today's
 *   spend won't be reflected until tomorrow.
 * - **Costs $0.01 per query.** We page the result lazily and rely on
 *   `loadCostBreakdown` being called only when /admin renders.
 *
 * Cost Explorer is global (us-east-1 only), so the regional environment
 * variable doesn't apply — the SDK auto-routes.
 */

export interface CostLine {
  service: string;
  amount: number;
  unit: string;
}

export interface CostBreakdown {
  ok: true;
  monthStart: string;
  total: number;
  unit: string;
  lines: CostLine[];
}

export interface CostBreakdownError {
  ok: false;
  reason: string;
}

const COST_EXPLORER_REGION = 'us-east-1';

/** $30/month all-in is the roadmap target — flag anything over this. */
export const COST_FLAG_THRESHOLD_USD = 30;

let cachedClient: CostExplorerClient | undefined;
function getClient(): CostExplorerClient {
  if (!cachedClient) cachedClient = new CostExplorerClient({ region: COST_EXPLORER_REGION });
  return cachedClient;
}

/**
 * Returns AWS month-to-date cost grouped by service. The result is small
 * (≤30 services on this stack) and lives in memory — no caching beyond the
 * SDK client because Cost Explorer is the source of truth and admin views
 * are infrequent.
 */
export async function loadCostBreakdown(): Promise<CostBreakdown | CostBreakdownError> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  // Cost Explorer's `End` is exclusive. Use tomorrow to capture every
  // amortised charge that's been finalised so far today (subject to the
  // 24-hour lag — we still surface whatever has landed).
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const resp = await getClient().send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: monthStart, End: tomorrow },
        Granularity: 'MONTHLY' as Granularity,
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION' as const, Key: 'SERVICE' as Dimension }],
      }),
    );

    const groups = resp.ResultsByTime?.[0]?.Groups ?? [];
    const lines: CostLine[] = [];
    let total = 0;
    let unit = 'USD';
    for (const g of groups) {
      const service = g.Keys?.[0] ?? 'Unknown';
      const amt = Number(g.Metrics?.UnblendedCost?.Amount ?? '0');
      const u = g.Metrics?.UnblendedCost?.Unit ?? 'USD';
      if (!Number.isFinite(amt)) continue;
      unit = u;
      total += amt;
      // Hide $0.00 lines — most accounts have a few of these from services
      // we haven't touched (e.g. KMS pricing changes propagating through).
      if (amt >= 0.005) lines.push({ service, amount: amt, unit: u });
    }
    lines.sort((a, b) => b.amount - a.amount);
    return { ok: true, monthStart, total, unit, lines };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Most likely reason: IAM role missing `ce:GetCostAndUsage`, or Cost
    // Explorer not enabled on the account. Both surface as AccessDenied.
    return {
      ok: false,
      reason: /AccessDenied|not authorized|ExpiredToken/i.test(message)
        ? 'Access denied. Grant the Web Lambda `ce:GetCostAndUsage` (added to infra/stacks/Web.ts in this PR) and redeploy.'
        : `Cost Explorer error: ${message}`,
    };
  }
}
