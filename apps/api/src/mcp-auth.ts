import { createDb } from '@speediance/db';

/**
 * Bearer-token → userId resolution for the remote MCP endpoint.
 *
 * The look-up is a single DDB GetItem on the reverse-index row
 * (PK=APIKEY#{key}, SK=KEY_LOOKUP). Cold lookups take ~10ms; warm-Lambda
 * lookups would still be ~10ms each. We cache them in-process for
 * `KEY_LOOKUP_TTL_MS` so a chatty MCP session against the same Lambda
 * instance only pays the DDB cost once.
 *
 * The cache key is the FULL token — same scope as the token itself —
 * which means it's only in Lambda memory and dies with the container.
 * We never log the cache contents.
 */

export interface ResolvedAuth {
  userId: string;
  /** Display-safe key prefix. Used in CloudWatch logs / metrics. */
  prefix: string;
}

const KEY_LOOKUP_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  userId: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Return only the safe prefix of a candidate token. Used everywhere we
 * log so the actual secret never appears in CloudWatch / X-Ray. Stable
 * for missing / malformed input so callers can pipe whatever they have.
 */
export function redactKey(raw: string | undefined | null): string {
  if (!raw) return '(none)';
  const trimmed = raw.replace(/^Bearer\s+/i, '').trim();
  if (!trimmed) return '(none)';
  // First 12 chars (`spd_` + 8) is the same shape we show on /profile.
  return `${trimmed.slice(0, 12)}…`;
}

/**
 * Parse the `Authorization` header and resolve the token to a userId.
 * Throws on missing/malformed header, unknown / revoked token, or DDB
 * errors — the caller turns thrown errors into a 401.
 */
export async function resolveBearerToken(header: string | undefined): Promise<ResolvedAuth> {
  if (!header) {
    throw new Error('missing Authorization header');
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) {
    throw new Error('malformed Authorization header');
  }
  const token = match[1]!;
  // Cheap rejection of obviously-wrong shapes. Real keys are 36 chars
  // (`spd_` + 32 base64 chars). We don't enforce the full grammar here —
  // the DDB lookup will fail closed for anything else.
  if (!token.startsWith('spd_') || token.length < 8) {
    throw new Error('not a speediance api key');
  }

  // Warm-Lambda cache hit?
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.expiresAt > now) {
    return { userId: hit.userId, prefix: redactKey(token) };
  }

  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMO_TABLE_NAME env var missing');
  }
  const userId = await createDb({ tableName }).global.apiKeyLookups.findUserId(token);
  if (!userId) {
    // Negative results are intentionally NOT cached. The cost of a single
    // DDB miss is small (~10ms) and not caching avoids "rotated a key
    // five minutes ago, still rejected" surprises on the happy path.
    throw new Error('unknown or revoked api key');
  }

  cache.set(token, { userId, expiresAt: now + KEY_LOOKUP_TTL_MS });
  // Bound the cache. Family-scale this never matters; one entry per
  // active session, evicted by TTL. The defensive cap stops a runaway.
  if (cache.size > 1024) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return { userId, prefix: redactKey(token) };
}

/**
 * Test-only hook to clear the cache between cases. Exported but never
 * called in production paths.
 */
export function __resetAuthCacheForTests(): void {
  cache.clear();
}
