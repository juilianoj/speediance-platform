import { describe, expect, it, vi } from 'vitest';
import {
  MOBILE_DEVICES,
  REGION_HOSTS,
  SpeedianceClient,
  SpeedianceUnauthorizedError,
  USER_AGENT,
  VERSION_CODE,
  buildHeaders,
} from '../src/index.js';
import { createFetchMock } from './helpers/fetchMock.js';

const FAKE_CREDENTIALS = {
  userId: '1234567',
  token: 'FIXTURE_TOKEN_NOT_A_REAL_SECRET',
  region: 'Global' as const,
  unit: 0 as const,
  deviceType: 1,
  allowMonsterMoves: false,
};

describe('buildHeaders', () => {
  it('includes all mandatory Speediance headers', () => {
    const headers = buildHeaders({ region: 'Global' });
    expect(headers.Host).toBe(REGION_HOSTS.Global);
    expect(headers['User-Agent']).toBe(USER_AGENT);
    expect(headers.Versioncode).toBe(VERSION_CODE);
    expect(headers.Mobiledevices).toBe(MOBILE_DEVICES);
    expect(headers).not.toHaveProperty('App_user_id');
    expect(headers).not.toHaveProperty('Token');
  });

  it('attaches credentials only when supplied', () => {
    const headers = buildHeaders({
      region: 'EU',
      credentials: { userId: 'u1', token: 't1' },
    });
    expect(headers.Host).toBe(REGION_HOSTS.EU);
    expect(headers.App_user_id).toBe('u1');
    expect(headers.Token).toBe('t1');
  });

  it('produces fresh timestamps per call', () => {
    const a = buildHeaders({ region: 'Global' });
    // Run-loop tick to avoid Date.now() returning identical values
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const b = buildHeaders({ region: 'Global' });
        expect(Number(b.Timestamp)).toBeGreaterThanOrEqual(Number(a.Timestamp));
        resolve();
      }, 2);
    });
  });
});

describe('SpeedianceClient — region & URL', () => {
  it('routes EU credentials at the EU host', async () => {
    const mock = createFetchMock([
      { method: 'GET', urlIncludes: '/api/app/accessories/list', fixture: 'userWorkouts.json' },
    ]);
    const client = new SpeedianceClient(
      { ...FAKE_CREDENTIALS, region: 'EU' },
      { fetch: mock.fetch },
    );
    await client.getAccessories();
    expect(mock.calls[0]?.url.startsWith(`https://${REGION_HOSTS.EU}`)).toBe(true);
  });

  it('routes Global credentials at the Global host', async () => {
    const mock = createFetchMock([
      { method: 'GET', urlIncludes: '/api/app/accessories/list', fixture: 'userWorkouts.json' },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    await client.getAccessories();
    expect(mock.calls[0]?.url.startsWith(`https://${REGION_HOSTS.Global}`)).toBe(true);
  });
});

describe('SpeedianceClient — login', () => {
  it('returns credentials on a happy-path two-step login', async () => {
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
    const client = new SpeedianceClient(null, { fetch: mock.fetch });
    const result = await client.login('user@example.com', 'hunter2');
    expect(result.ok).toBe(true);
    expect(result.credentials?.userId).toBe('1234567');
    expect(result.credentials?.token).toBe('FIXTURE_TOKEN_NOT_A_REAL_SECRET');
    expect(client.getCredentials()?.userId).toBe('1234567');
  });

  it('rejects when verifyIdentity says the account does not exist', async () => {
    const mock = createFetchMock([
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/login/verifyIdentity',
        fixture: 'verifyIdentity.notFound.json',
      },
    ]);
    const client = new SpeedianceClient(null, { fetch: mock.fetch });
    const result = await client.login('ghost@example.com', 'hunter2');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not exist/i);
  });
});

describe('SpeedianceClient — unauthorized handling', () => {
  it('translates code:91 into SpeedianceUnauthorizedError', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/mobile/v2/report/userTrainingDataRecord',
        fixture: 'unauthorized.code91.json',
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    await expect(client.getTrainingRecords('2026-05-01', '2026-05-31')).rejects.toBeInstanceOf(
      SpeedianceUnauthorizedError,
    );
  });

  it('translates HTTP 401 into SpeedianceUnauthorizedError', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/v4/customTrainingTemplate/appPage',
        body: { msg: 'unauthorized' },
        status: 401,
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    await expect(client.getUserWorkouts()).rejects.toBeInstanceOf(SpeedianceUnauthorizedError);
  });

  it('invokes onUnauthorized and retries once when it returns true', async () => {
    let attempt = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      attempt++;
      const url = typeof input === 'string' ? input : (input as Request).url;
      // First attempt — code:91, second attempt — success
      const body =
        attempt === 1
          ? { code: 91, msg: 'token invalid' }
          : { code: 0, msg: 'ok', data: [{ id: 1 }] };
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      void url;
    };
    const onUnauthorized = vi.fn(async () => true);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, {
      fetch: fetchImpl,
      onUnauthorized,
    });
    const data = (await client.getTrainingRecords('2026-05-01', '2026-05-31')) as unknown[];
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(data).toEqual([{ id: 1 }]);
    expect(attempt).toBe(2);
  });

  it('propagates the original error when onUnauthorized returns false', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/mobile/v2/report/userTrainingDataRecord',
        fixture: 'unauthorized.code91.json',
      },
    ]);
    const onUnauthorized = vi.fn(async () => false);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, {
      fetch: mock.fetch,
      onUnauthorized,
    });
    await expect(client.getTrainingRecords('2026-05-01', '2026-05-31')).rejects.toBeInstanceOf(
      SpeedianceUnauthorizedError,
    );
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe('SpeedianceClient — read endpoints', () => {
  it('getTrainingRecords returns the envelope data array', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/mobile/v2/report/userTrainingDataRecord',
        fixture: 'trainingRecords.json',
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    const records = (await client.getTrainingRecords('2026-05-01', '2026-05-31')) as Array<{
      id: number;
    }>;
    expect(records).toHaveLength(2);
    expect(records[0]?.id).toBe(9001);

    const call = mock.calls[0];
    expect(call?.url).toContain('startDate=2026-05-01');
    expect(call?.url).toContain('endDate=2026-05-31');
    expect(call?.headers.App_user_id).toBe('1234567');
    expect(call?.headers.Token).toBe('FIXTURE_TOKEN_NOT_A_REAL_SECRET');
  });

  it('getCalendarMonth includes the deviceType in the query', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/v5/trainingCalendar/monthNew',
        fixture: 'calendarMonth.json',
      },
    ]);
    const client = new SpeedianceClient(
      { ...FAKE_CREDENTIALS, deviceType: 2 },
      { fetch: mock.fetch },
    );
    await client.getCalendarMonth('2026-05');
    expect(mock.calls[0]?.url).toContain('selectedDeviceType=2');
    expect(mock.calls[0]?.url).toContain('date=2026-05');
  });

  it('getUserWorkouts uses pageSize=-1 to fetch everything', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/v4/customTrainingTemplate/appPage',
        fixture: 'userWorkouts.json',
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    const workouts = (await client.getUserWorkouts()) as Array<{ id: number }>;
    expect(workouts).toHaveLength(2);
    expect(mock.calls[0]?.url).toContain('pageSize=-1');
  });
});

describe('SpeedianceClient — scheduleWorkout', () => {
  it('POSTs to templateReservation with status=1 and the right payload', async () => {
    const mock = createFetchMock([
      {
        method: 'POST',
        urlIncludes: '/api/app/templateReservation',
        body: { code: 0, msg: 'ok', data: true },
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    const ok = await client.scheduleWorkout('2026-05-12', 'TPL-A1', 1);
    expect(ok).toBe(true);
    const sent = JSON.parse(mock.calls[0]?.body ?? '{}');
    expect(sent).toEqual({
      status: 1,
      deviceType: 1,
      thatDay: '2026-05-12',
      templateCode: 'TPL-A1',
    });
  });

  it('returns false when the API returns null/false', async () => {
    const mock = createFetchMock([
      {
        method: 'POST',
        urlIncludes: '/api/app/templateReservation',
        body: { code: 0, msg: 'ok', data: false },
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });
    expect(await client.scheduleWorkout('2026-05-12', 'TPL-A1', 0)).toBe(false);
  });
});

describe('SpeedianceClient — saveWorkout', () => {
  it('emits the CSV-style fields with correct lengths and weight conversion', async () => {
    // Order of calls: batchDetails → exerciseDetail (unilateral check) → POST template
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/list?',
        fixture: 'batchDetails.json',
      },
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/100?',
        body: { code: 0, msg: 'ok', data: { isLeftRight: 0 } },
      },
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/customTrainingTemplate',
        body: { code: 0, msg: 'ok', data: { id: 9999 } },
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });

    await client.saveWorkout('Test Day', [
      {
        groupId: 100,
        sets: [
          { reps: 8, weight: 100, mode: 1, rest: 90 },
          { reps: 8, weight: 100, mode: 1, rest: 90 },
        ],
      },
    ]);

    const post = mock.calls.find((c) => c.method === 'POST');
    const body = JSON.parse(post?.body ?? '{}') as {
      name: string;
      totalCapacity: number;
      actionLibraryList: Array<{
        groupId: number;
        actionLibraryId: number;
        setsAndReps: string;
        weights: string;
        leftRight: string;
        breakTime: string;
      }>;
    };

    expect(body.name).toBe('Test Day');
    expect(body.actionLibraryList).toHaveLength(1);
    const ex = body.actionLibraryList[0]!;
    expect(ex.groupId).toBe(100);
    expect(ex.actionLibraryId).toBe(1001);
    expect(ex.setsAndReps).toBe('8,8');
    // Weight conversion: lb (input) × 2.2 = api units; 100 → 220.0 each
    expect(ex.weights).toBe('220.0,220.0');
    expect(ex.leftRight).toBe('0,0'); // bilateral
    expect(ex.breakTime).toBe('90,90');
    expect(body.totalCapacity).toBeCloseTo(2 * 8 * 220);
  });

  it('alternates leftRight 1,2 for unilateral exercises', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/list?',
        fixture: 'batchDetails.json',
      },
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/100?',
        body: { code: 0, msg: 'ok', data: { isLeftRight: 1 } },
      },
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/customTrainingTemplate',
        body: { code: 0, msg: 'ok', data: { id: 9999 } },
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });

    await client.saveWorkout('Single Arm', [
      {
        groupId: 100,
        sets: [
          { reps: 10, weight: 50 },
          { reps: 10, weight: 50 },
          { reps: 10, weight: 50 },
          { reps: 10, weight: 50 },
        ],
      },
    ]);

    const post = mock.calls.find((c) => c.method === 'POST');
    const body = JSON.parse(post?.body ?? '{}') as {
      actionLibraryList: Array<{ leftRight: string }>;
    };
    expect(body.actionLibraryList[0]?.leftRight).toBe('1,2,1,2');
  });

  it('routes preset weights into counterweight2 with dummy weights field', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/list?',
        fixture: 'batchDetails.json',
      },
      {
        method: 'GET',
        urlIncludes: '/api/app/actionLibraryGroup/200?',
        body: { code: 0, msg: 'ok', data: { isLeftRight: 0 } },
      },
      {
        method: 'POST',
        urlIncludes: '/api/app/v2/customTrainingTemplate',
        body: { code: 0, msg: 'ok', data: { id: 9999 } },
      },
    ]);
    const client = new SpeedianceClient(FAKE_CREDENTIALS, { fetch: mock.fetch });

    await client.saveWorkout('Preset Day', [
      {
        groupId: 200,
        preset_id: 42,
        sets: [
          { reps: 6, weight: 25 },
          { reps: 6, weight: 25 },
        ],
      },
    ]);

    const post = mock.calls.find((c) => c.method === 'POST');
    const body = JSON.parse(post?.body ?? '{}') as {
      actionLibraryList: Array<{
        templatePresetId: number;
        weights: string;
        counterweight: string;
        counterweight2: string;
      }>;
    };
    const ex = body.actionLibraryList[0]!;
    expect(ex.templatePresetId).toBe(42);
    expect(ex.weights).toBe('3.5,3.5');
    expect(ex.counterweight2).toBe('25,25');
    expect(ex.counterweight).toBe('25,25');
  });
});

describe('SpeedianceClient — onRequest debug hook', () => {
  it('emits debug info for every request', async () => {
    const mock = createFetchMock([
      {
        method: 'GET',
        urlIncludes: '/api/app/v4/customTrainingTemplate/appPage',
        fixture: 'userWorkouts.json',
      },
    ]);
    const onRequest = vi.fn();
    const client = new SpeedianceClient(FAKE_CREDENTIALS, {
      fetch: mock.fetch,
      onRequest,
    });
    await client.getUserWorkouts();
    expect(onRequest).toHaveBeenCalledOnce();
    const debug = onRequest.mock.calls[0]?.[0];
    expect(debug.method).toBe('GET');
    expect(debug.status).toBe(200);
    expect(debug.responseBody).toMatchObject({ code: 0 });
  });
});
