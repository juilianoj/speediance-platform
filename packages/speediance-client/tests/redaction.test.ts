import { describe, expect, it, vi } from 'vitest';
import { SpeedianceClient, type RequestDebugInfo } from '../src/index.js';
import { createFetchMock } from './helpers/fetchMock.js';

const CREDS = {
  userId: '1234567',
  token: 'SECRET_TOKEN_THAT_MUST_NEVER_LEAK',
  region: 'Global' as const,
  unit: 0 as const,
  deviceType: 1,
  allowMonsterMoves: false,
};

describe('debug callback redacts secrets', () => {
  it('replaces Token / App_user_id headers with [redacted] before emitting', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/v4/customTrainingTemplate/appPage',
        fixture: 'userWorkouts.json',
      },
    ]);
    const debug: RequestDebugInfo[] = [];
    const client = new SpeedianceClient(CREDS, {
      fetch: mock.fetch,
      onRequest: (d) => debug.push(d),
    });
    await client.getUserWorkouts();
    const headers = debug[0]?.requestHeaders ?? {};
    expect(headers.Token).toBe('[redacted]');
    expect(headers.App_user_id).toBe('[redacted]');
    expect(JSON.stringify(debug)).not.toContain(CREDS.token);
    expect(JSON.stringify(debug)).not.toContain(CREDS.userId);
  });

  it('redacts the token field in byPass response bodies', async () => {
    const mock = createFetchMock([
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/login/verifyIdentity',
        fixture: 'verifyIdentity.exists.json',
      },
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/login/byPass',
        fixture: 'byPass.success.json',
      },
    ]);
    const debug: RequestDebugInfo[] = [];
    const client = new SpeedianceClient(null, {
      fetch: mock.fetch,
      onRequest: (d) => debug.push(d),
    });
    await client.login('user@example.com', 'hunter2');

    // byPass.success.json carries the real fixture token.
    const FIXTURE_TOKEN = 'FIXTURE_TOKEN_NOT_A_REAL_SECRET';
    const serialized = JSON.stringify(debug);
    expect(serialized).not.toContain(FIXTURE_TOKEN);
    // Sanity-check: the redaction marker shows up where the token was.
    expect(serialized).toContain('[redacted]');
  });

  it('redacts the password field in byPass request bodies', async () => {
    const mock = createFetchMock([
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/login/verifyIdentity',
        fixture: 'verifyIdentity.exists.json',
      },
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/login/byPass',
        fixture: 'byPass.success.json',
      },
    ]);
    const debug: RequestDebugInfo[] = [];
    const client = new SpeedianceClient(null, {
      fetch: mock.fetch,
      onRequest: (d) => debug.push(d),
    });
    await client.login('user@example.com', 'a-very-secret-password-12345');
    const serialized = JSON.stringify(debug);
    expect(serialized).not.toContain('a-very-secret-password-12345');
  });

  it('login() does not return the bypass body as detail on partial-failure shapes', async () => {
    // Simulate the Speediance "weird half-success" case: code 0, partial body
    // that contains a token but is missing appUserId. The pre-fix code would
    // serialize this into the LoginResult.detail string.
    const mock = {
      fetch: vi.fn(async (_input: RequestInfo | URL) => {
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { token: 'PARTIAL_FAILURE_TOKEN_DO_NOT_LEAK' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch,
    };
    const client = new SpeedianceClient(null, { fetch: mock.fetch });
    const result = await client.login('user@example.com', 'pw');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PARTIAL_FAILURE_TOKEN_DO_NOT_LEAK');
  });
});
