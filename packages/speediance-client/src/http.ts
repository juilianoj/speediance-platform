import {
  MOBILE_DEVICES,
  REGION_HOSTS,
  SpeedianceApiError,
  SpeedianceEnvelopeSchema,
  SpeedianceUnauthorizedError,
  UNAUTHORIZED_CODE,
  USER_AGENT,
  VERSION_CODE,
  type Credentials,
  type Region,
  type RequestDebugInfo,
} from './types.js';

export interface BuildHeadersInput {
  region: Region;
  /** Set only on authenticated requests (everything except login verify/byPass). */
  credentials?: Pick<Credentials, 'userId' | 'token'>;
}

/** Build the header bag the Speediance mobile API expects. The order matters
 *  for nothing — but every header listed here is required by at least one
 *  endpoint, so we always send all of them. */
export function buildHeaders({ region, credentials }: BuildHeadersInput): Record<string, string> {
  const host = REGION_HOSTS[region];
  const headers: Record<string, string> = {
    Host: host,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    Timestamp: String(Date.now()),
    Utc_offset: '+0000',
    Versioncode: VERSION_CODE,
    Mobiledevices: MOBILE_DEVICES,
    Timezone: 'GMT',
    'Accept-Language': 'en',
    App_type: 'SOFTWARE',
    Connection: 'keep-alive',
    'Accept-Encoding': 'gzip, deflate, br',
  };
  if (credentials) {
    headers.App_user_id = credentials.userId;
    headers.Token = credentials.token;
  }
  return headers;
}

export function baseUrl(region: Region): string {
  return `https://${REGION_HOSTS[region]}`;
}

export interface RequestInputs {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  fetchImpl: typeof fetch;
  onRequest?: (debug: RequestDebugInfo) => void;
}

/** Low-level wrapper around fetch that:
 *   1) JSON-encodes the request body,
 *   2) Parses the envelope,
 *   3) Translates `code:91` and HTTP 401 into SpeedianceUnauthorizedError,
 *   4) Emits debug info via the optional callback.
 *
 * It does NOT retry — retry-with-relogin is handled one layer up. */
export async function request<T = unknown>({
  method,
  url,
  headers,
  body,
  fetchImpl,
  onRequest,
}: RequestInputs): Promise<{ status: number; data: T; body: unknown }> {
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let resp: Response;
  try {
    resp = await fetchImpl(url, init);
  } catch (err) {
    onRequest?.({
      timestamp: new Date().toISOString(),
      method,
      url,
      requestHeaders: headers,
      requestBody: body,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const text = await resp.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response — keep raw text in `parsed` for debug visibility.
    }
  }

  onRequest?.({
    timestamp: new Date().toISOString(),
    method,
    url,
    status: resp.status,
    requestHeaders: headers,
    requestBody: body,
    responseBody: parsed,
  });

  if (resp.status === 401) {
    throw new SpeedianceUnauthorizedError(401);
  }

  const envelope = SpeedianceEnvelopeSchema.safeParse(parsed);
  if (envelope.success && envelope.data.code === UNAUTHORIZED_CODE) {
    throw new SpeedianceUnauthorizedError(resp.status);
  }

  if (!resp.ok) {
    throw new SpeedianceApiError(
      `Speediance ${method} ${url} failed: HTTP ${resp.status}`,
      resp.status,
      parsed,
    );
  }

  // Most endpoints follow the envelope and the caller wants `.data` directly,
  // but a few (e.g. courseReservation) inspect the full body. Return both.
  const data = envelope.success ? envelope.data.data : parsed;
  return { status: resp.status, data: data as T, body: parsed };
}
