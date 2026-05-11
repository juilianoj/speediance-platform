import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');

export function loadFixture<T = unknown>(name: string): T {
  const raw = readFileSync(join(fixturesDir, name), 'utf-8');
  return JSON.parse(raw) as T;
}

export interface MockRoute {
  method?: string;
  /** Substring match on the request URL (ignores host so tests don't break
   *  if we swap Global ↔ EU regions). */
  urlIncludes: string;
  /** Either a fixture filename or an inline body. */
  fixture?: string;
  body?: unknown;
  status?: number;
}

export interface FetchMock {
  fetch: typeof fetch;
  calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }>;
}

/** Build a fetch implementation that resolves the first matching route.
 *  Unmatched URLs throw — tests should fail loudly when an endpoint changes. */
export function createFetchMock(routes: MockRoute[]): FetchMock {
  const mock: FetchMock = {
    calls: [],
    fetch: async (input, init = {}) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init.method ?? 'GET').toUpperCase();
      const headers = normalizeHeaders(init.headers);
      mock.calls.push({
        url,
        method,
        headers,
        body: typeof init.body === 'string' ? init.body : undefined,
      });

      const route = routes.find(
        (r) => (r.method ?? 'GET').toUpperCase() === method && url.includes(r.urlIncludes),
      );
      if (!route) {
        throw new Error(`fetchMock: no route registered for ${method} ${url}`);
      }
      const body = route.fixture ? loadFixture(route.fixture) : route.body;
      const status = route.status ?? 200;
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  return mock;
}

function normalizeHeaders(input: HeadersInit | undefined): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) {
    const out: Record<string, string> = {};
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    return Object.fromEntries(input);
  }
  return { ...(input as Record<string, string>) };
}
