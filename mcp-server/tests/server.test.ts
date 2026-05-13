import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { UserScopedDb } from '@speediance/db';
import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

/**
 * Hand-rolled `UserScopedDb` stand-in. Real ElectroDB calls would need
 * a DynamoDB client; for the MCP layer all we care about is whether the
 * server dispatches to the right entity method with the right args.
 *
 * Each entity returns a `{ data: ... }` envelope matching the shape the
 * real implementation produces (see `packages/db/src/scoped.ts`).
 */
function fakeDb(overrides: Partial<UserScopedDb> = {}): UserScopedDb {
  const reject = (label: string) => async () => {
    throw new Error(`fakeDb.${label} not stubbed in this test`);
  };
  // Cast is fine — we satisfy the structural contract well enough for the
  // tools we exercise. Tests that touch new methods supply them via
  // `overrides`.
  return {
    userId: 'test-user',
    profiles: {
      get: reject('profiles.get'),
      upsert: reject('profiles.upsert'),
      patch: reject('profiles.patch'),
    },
    workouts: {
      list: reject('workouts.list'),
      listWeek: reject('workouts.listWeek'),
      put: reject('workouts.put'),
      get: reject('workouts.get'),
    },
    sets: {
      forWorkout: reject('sets.forWorkout'),
      listAll: reject('sets.listAll'),
      put: reject('sets.put'),
      deleteForWorkout: reject('sets.deleteForWorkout'),
    },
    exercises: {
      list: reject('exercises.list'),
      get: reject('exercises.get'),
      upsert: reject('exercises.upsert'),
    },
    weekAggregates: {
      list: reject('weekAggregates.list'),
      get: reject('weekAggregates.get'),
      upsert: reject('weekAggregates.upsert'),
    },
    cycleAggregates: {
      list: reject('cycleAggregates.list'),
      get: reject('cycleAggregates.get'),
      upsert: reject('cycleAggregates.upsert'),
    },
    muscleAggregates: {
      list: reject('muscleAggregates.list'),
      get: reject('muscleAggregates.get'),
      upsert: reject('muscleAggregates.upsert'),
    },
    programs: {
      list: reject('programs.list'),
      get: reject('programs.get'),
      upsert: reject('programs.upsert'),
    },
    memories: { list: reject('memories.list'), put: reject('memories.put') },
    feedback: { list: reject('feedback.list'), put: reject('feedback.put') },
    notes: {
      forTarget: reject('notes.forTarget'),
      put: reject('notes.put'),
      delete: reject('notes.delete'),
    },
    workoutDrafts: {
      list: reject('workoutDrafts.list'),
      get: reject('workoutDrafts.get'),
      upsert: reject('workoutDrafts.upsert'),
      patch: reject('workoutDrafts.patch'),
      delete: reject('workoutDrafts.delete'),
    },
    programDrafts: {
      list: reject('programDrafts.list'),
      get: reject('programDrafts.get'),
      upsert: reject('programDrafts.upsert'),
      patch: reject('programDrafts.patch'),
      delete: reject('programDrafts.delete'),
    },
    ...overrides,
  } as UserScopedDb;
}

async function bootConnectedPair(db: UserScopedDb): Promise<Client> {
  const server = createServer({ getDb: () => db });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe('@speediance/mcp-server', () => {
  it('lists all 4 expected tools', async () => {
    const client = await bootConnectedPair(fakeDb());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['getExerciseHistory', 'getLastSession', 'logCoachingNote', 'proposeWorkout'].sort(),
    );
    // Sanity-check that each tool has a non-empty description and an
    // object input schema — the MCP client compiles these into validators
    // and a missing description makes the Claude Desktop UI look broken.
    for (const t of tools) {
      expect(t.description, `${t.name} description`).toBeTruthy();
      expect(t.inputSchema?.type).toBe('object');
    }
    await client.close();
  });

  it('round-trips getLastSession with a faked DDB response', async () => {
    const db = fakeDb({
      workouts: {
        list: async () => ({
          data: [
            {
              startTime: '2026-05-12T17:00:00.000Z',
              title: 'Push day',
              durationSeconds: 2700,
              outputJoules: 95000,
              calories: 220,
              muscleGroupSets: { pecs: 12, triceps: 9 },
            },
            {
              startTime: '2026-05-10T17:00:00.000Z',
              title: 'Pull day',
              durationSeconds: 2400,
            },
          ],
        }),
        listWeek: async () => ({ data: [] }),
        put: async () => ({}),
        get: async () => ({ data: null }),
      },
    });

    const client = await bootConnectedPair(db);
    const result = await client.callTool({ name: 'getLastSession', arguments: {} });
    // The server returns content as a single text block of JSON — parse
    // it back to assert on the projected shape.
    const blocks = result.content as Array<{ type: string; text: string }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('text');
    const payload = JSON.parse(blocks[0]!.text) as {
      startTime: string;
      title: string;
      outputKj: number;
      durationMinutes: number;
    };
    expect(payload.startTime).toBe('2026-05-12T17:00:00.000Z');
    expect(payload.title).toBe('Push day');
    expect(payload.outputKj).toBe(95); // 95000 J → 95 kJ
    expect(payload.durationMinutes).toBe(45); // 2700 s → 45 min
    await client.close();
  });

  it('rejects proposeWorkout when required args are missing', async () => {
    const client = await bootConnectedPair(fakeDb());
    // No `exercises` array — the schema-level validation in McpServer
    // should turn this into a tool error rather than a thrown exception.
    const result = await client.callTool({
      name: 'proposeWorkout',
      arguments: { name: 'Empty workout' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});
