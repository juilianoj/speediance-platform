import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `@speediance/db`'s `createDb` is the only thing the Hono app calls
// into beyond pure HTTP plumbing. We mock the whole module so the test
// never touches DynamoDB and so we can intercept `forUser(userId)` to
// confirm we resolved the bearer token correctly.
const fakeUserScopedDb = vi.fn();
const fakeFindUserId = vi.fn<(key: string) => Promise<string | null>>();

vi.mock('@speediance/db', () => {
  return {
    createDb: vi.fn(() => ({
      forUser: fakeUserScopedDb,
      global: {
        apiKeyLookups: {
          findUserId: fakeFindUserId,
        },
      },
    })),
  };
});

// Stand-in for `UserScopedDb`. Only the methods the four MCP tools
// reach are exercised — `workouts.list` covers `getLastSession`.
function buildFakeDb(userId: string) {
  return {
    userId,
    workouts: {
      list: async () => ({ data: [] }),
      listWeek: async () => ({ data: [] }),
      put: async () => ({}),
      get: async () => ({ data: null }),
    },
    sets: {
      forWorkout: async () => ({ data: [] }),
      listAll: async () => ({ data: [] }),
      put: async () => ({}),
      deleteForWorkout: async () => {},
    },
    profiles: {
      get: async () => ({ data: null }),
      upsert: async () => ({}),
      patch: async () => ({}),
      delete: async () => ({}),
    },
    exercises: { list: async () => ({}), get: async () => ({}), upsert: async () => ({}) },
    weekAggregates: { list: async () => ({}), get: async () => ({}), upsert: async () => ({}) },
    cycleAggregates: { list: async () => ({}), get: async () => ({}), upsert: async () => ({}) },
    muscleAggregates: { list: async () => ({}), get: async () => ({}), upsert: async () => ({}) },
    programs: { list: async () => ({}), get: async () => ({}), upsert: async () => ({}) },
    memories: { list: async () => ({ data: [] }), put: async () => ({}) },
    feedback: { list: async () => ({}), put: async () => ({}) },
    notes: { forTarget: async () => ({}), put: async () => ({}), delete: async () => ({}) },
    workoutDrafts: {
      list: async () => ({}),
      get: async () => ({}),
      upsert: async () => ({}),
      patch: async () => ({}),
      delete: async () => ({}),
    },
    programDrafts: {
      list: async () => ({}),
      get: async () => ({}),
      upsert: async () => ({}),
      patch: async () => ({}),
      delete: async () => ({}),
    },
    apiKeys: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    },
  };
}

beforeEach(async () => {
  process.env.DYNAMO_TABLE_NAME = 'TestTable';
  fakeUserScopedDb.mockReset();
  fakeFindUserId.mockReset();
  const { __resetAuthCacheForTests } = await import('../src/mcp-auth.js');
  __resetAuthCacheForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('apps/api — /health', () => {
  it('answers GET /health without auth', async () => {
    const { app } = await import('../src/index.js');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('apps/api — /mcp auth', () => {
  it('rejects requests without Authorization header (401)', async () => {
    const { app } = await import('../src/index.js');
    const res = await app.request('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed bearer tokens (401)', async () => {
    const { app } = await import('../src/index.js');
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer not-a-spd-key' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown keys (401, and never logs the value)', async () => {
    fakeFindUserId.mockResolvedValueOnce(null);
    const { app } = await import('../src/index.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await app.request('/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer spd_unknown_value_12345' },
        body: '{}',
      });
      expect(res.status).toBe(401);
      // The log line carries only the prefix, not the full token.
      for (const call of warn.mock.calls) {
        const dump = JSON.stringify(call);
        expect(dump).not.toContain('unknown_value_12345');
      }
    } finally {
      warn.mockRestore();
    }
  });
});

describe('apps/api — /mcp success path', () => {
  it('resolves a known key to the right userId, lists tools, and answers getLastSession', async () => {
    const TEST_KEY = 'spd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const TEST_USER_ID = 'cognito-sub-alice';

    fakeFindUserId.mockResolvedValueOnce(TEST_USER_ID);
    fakeUserScopedDb.mockReturnValueOnce(buildFakeDb(TEST_USER_ID));

    const { app } = await import('../src/index.js');

    // Helper: pump one MCP JSON-RPC request through the Hono app and
    // return the parsed response payload. The SDK accepts either JSON
    // or SSE; we opted into `enableJsonResponse: true` so the body is
    // a single JSON document.
    async function rpc(message: object) {
      const res = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_KEY}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(message),
      });
      expect(res.status).toBe(200);
      return res;
    }

    // Each MCP request goes through the full stateless flow:
    // `initialize` first, then `tools/list`. Since we're in stateless
    // mode each request is independent — no session id is required.
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'test', version: '0.0.1' },
        capabilities: {},
      },
    });
    const initBody = (await init.json()) as { result?: { serverInfo?: { name: string } } };
    expect(initBody.result?.serverInfo?.name).toBe('@speediance/mcp-server');

    // Next call needs fresh mocks because the stateless transport gets a
    // new `createServer({ getDb })` each time.
    fakeFindUserId.mockResolvedValueOnce(TEST_USER_ID);
    fakeUserScopedDb.mockReturnValueOnce(buildFakeDb(TEST_USER_ID));

    const list = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const listBody = (await list.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = listBody.result?.tools?.map((t) => t.name).sort() ?? [];
    expect(names).toEqual(
      ['getExerciseHistory', 'getLastSession', 'logCoachingNote', 'proposeWorkout'].sort(),
    );

    // The userId we resolved must be the one bound to the scoped DB.
    expect(fakeUserScopedDb).toHaveBeenCalledWith(TEST_USER_ID);
  });
});
