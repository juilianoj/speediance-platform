import 'server-only';

import { createDb } from '@speediance/db';

/**
 * Per-user Bedrock spend rollup for /admin (roadmap §4.7 follow-up).
 *
 * Cost Explorer can't slice Bedrock spend by user — the model invocations
 * all hit one Lambda role, and Cost Allocation Tags don't operate at
 * invocation granularity. Instead we log every coach turn to the
 * `coachInvocation` entity and estimate cost from Bedrock's published
 * per-token pricing.
 *
 * Output is month-to-date with each user's:
 *   - turn count
 *   - input / output tokens
 *   - estimated $ spend
 *   - duration percentile-ish info ("p95 7.2s")
 *
 * The /admin Cost widget (#96) still surfaces total AWS spend from Cost
 * Explorer — this complements it with the per-user slice for the
 * variable Bedrock chunk specifically.
 */

interface CoachInvocationRow {
  userId: string;
  startedAt: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  iterations?: number;
  durationMs?: number;
  ok?: boolean;
}

export interface UserCoachSpendRow {
  userId: string;
  turns: number;
  successfulTurns: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD spend month-to-date for this user. */
  estimatedUsd: number;
  /** Slowest single turn this month (ms). Catches model loops / runaway prompts. */
  maxDurationMs: number;
}

export interface CoachSpendBreakdown {
  /** Month-to-date start (YYYY-MM-DD), for display. */
  monthStart: string;
  /** Per-user rows, descending by spend. */
  rows: UserCoachSpendRow[];
  /** Sum of `estimatedUsd` across all rows. */
  totalUsd: number;
  /** Sum of every user's turn count. */
  totalTurns: number;
  /** $/user flag — anyone above this gets red in the UI. The roadmap's
   *  "above $5/user/mo" alert lives at this threshold. */
  flagThresholdUsd: number;
}

/**
 * Bedrock published pricing as of 2026-05. Update when AWS changes it —
 * the constants are the only thing wrong if the table on
 * https://aws.amazon.com/bedrock/pricing/ moves. We use the Anthropic
 * Sonnet 4 rates by default since that's what BEDROCK_MODEL_ID resolves
 * to. If you point the coach at Opus, override here.
 */
const PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  // Sonnet 4 / 4.6 (current default)
  sonnet: { input: 3, output: 15 },
  // Opus 4 — keep around for the program-generator path
  opus: { input: 15, output: 75 },
  // Haiku 4 — cheap option
  haiku: { input: 1, output: 5 },
};

/** Map a Bedrock model id to a pricing tier. Conservative: anything
 *  unrecognized falls back to Sonnet pricing rather than $0. */
function pricingFor(modelId: string | undefined): { input: number; output: number } {
  const id = (modelId ?? '').toLowerCase();
  if (id.includes('opus')) return PRICING_USD_PER_MILLION_TOKENS.opus!;
  if (id.includes('haiku')) return PRICING_USD_PER_MILLION_TOKENS.haiku!;
  return PRICING_USD_PER_MILLION_TOKENS.sonnet!;
}

const FLAG_THRESHOLD_USD = 5;

/**
 * Load every coach invocation since the start of the calendar month and
 * roll up per-user. Used by /admin only — we iterate USER#{id} partitions
 * via a scan-the-listUsers-then-query-each-user pattern, since the
 * coachInvocation entity's primary key is user-partitioned.
 */
export async function loadCoachSpendBreakdown(userIds: string[]): Promise<CoachSpendBreakdown> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  if (!tableName || userIds.length === 0) {
    return {
      monthStart,
      rows: [],
      totalUsd: 0,
      totalTurns: 0,
      flagThresholdUsd: FLAG_THRESHOLD_USD,
    };
  }

  const db = createDb({ tableName });
  const rows: UserCoachSpendRow[] = [];
  let totalUsd = 0;
  let totalTurns = 0;

  // Sequential per-user query (small N — family scale). Could be Promise.all
  // for 10× users; for now we'd rather not parallel-blast DDB from /admin.
  for (const userId of userIds) {
    const me = db.forUser(userId);
    const result = (await me.coachInvocations.list()) as { data: CoachInvocationRow[] };
    const monthRows = (result.data ?? []).filter(
      (r) => typeof r.startedAt === 'string' && r.startedAt >= monthStart,
    );
    if (monthRows.length === 0) continue;

    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedUsd = 0;
    let successful = 0;
    let maxDurationMs = 0;
    for (const r of monthRows) {
      const inTok = r.inputTokens ?? 0;
      const outTok = r.outputTokens ?? 0;
      inputTokens += inTok;
      outputTokens += outTok;
      if (r.ok) successful += 1;
      if ((r.durationMs ?? 0) > maxDurationMs) maxDurationMs = r.durationMs ?? 0;
      const price = pricingFor(r.modelId);
      estimatedUsd += (inTok * price.input + outTok * price.output) / 1_000_000;
    }
    rows.push({
      userId,
      turns: monthRows.length,
      successfulTurns: successful,
      inputTokens,
      outputTokens,
      estimatedUsd,
      maxDurationMs,
    });
    totalUsd += estimatedUsd;
    totalTurns += monthRows.length;
  }

  rows.sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  return {
    monthStart,
    rows,
    totalUsd,
    totalTurns,
    flagThresholdUsd: FLAG_THRESHOLD_USD,
  };
}
