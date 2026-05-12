import { describe, expect, it, vi } from 'vitest';
import {
  ResourceExistsException,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';

import { createSecretsStore } from '../src/store.js';

interface CapturedCall {
  command: string;
  input: unknown;
}

function mockClient(handlers: Record<string, (input: unknown) => unknown>) {
  const calls: CapturedCall[] = [];
  const client = {
    send: vi.fn(async (cmd: { constructor: { name: string }; input: unknown }) => {
      const name = cmd.constructor.name;
      calls.push({ command: name, input: cmd.input });
      const h = handlers[name];
      if (!h) throw new Error(`mockClient: no handler for ${name}`);
      return h(cmd.input);
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

const VALID_SECRET = {
  email: 'user@example.com',
  password: 'secret-password',
  region: 'Global' as const,
  deviceType: 1,
  allowMonsterMoves: false,
};

describe('createSecretsStore', () => {
  it('throws on missing stage', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createSecretsStore({ stage: '' as any })).toThrow(/stage/i);
  });

  it('throws on missing userId', async () => {
    const { client } = mockClient({});
    const store = createSecretsStore({ stage: 'dev', client });
    await expect(store.get('')).rejects.toThrow(/userId/i);
  });
});

describe('get', () => {
  it('returns the parsed secret on hit', async () => {
    const { client, calls } = mockClient({
      GetSecretValueCommand: () => ({
        SecretString: JSON.stringify(VALID_SECRET),
      }),
    });
    const store = createSecretsStore({ stage: 'dev', client });
    const result = await store.get('alice');
    expect(result?.email).toBe('user@example.com');
    expect(calls[0]?.command).toBe('GetSecretValueCommand');
    expect((calls[0]?.input as { SecretId: string }).SecretId).toBe(
      'speediance-platform/dev/users/alice/speediance',
    );
  });

  it("returns null when the secret doesn't exist", async () => {
    const { client } = mockClient({
      GetSecretValueCommand: () => {
        throw new ResourceNotFoundException({ message: 'not found', $metadata: {} });
      },
    });
    const store = createSecretsStore({ stage: 'dev', client });
    expect(await store.get('alice')).toBeNull();
  });

  it('returns null on stored-secret schema mismatch (not throw)', async () => {
    const { client } = mockClient({
      GetSecretValueCommand: () => ({ SecretString: JSON.stringify({ broken: 'data' }) }),
    });
    const store = createSecretsStore({ stage: 'dev', client });
    expect(await store.get('alice')).toBeNull();
  });

  it('rethrows non-NotFound errors', async () => {
    const { client } = mockClient({
      GetSecretValueCommand: () => {
        throw new Error('AccessDenied');
      },
    });
    const store = createSecretsStore({ stage: 'dev', client });
    await expect(store.get('alice')).rejects.toThrow(/AccessDenied/);
  });
});

describe('put', () => {
  it('creates the secret on first call', async () => {
    const { client, calls } = mockClient({
      CreateSecretCommand: () => ({
        ARN: 'arn:aws:secretsmanager:us-west-2:1:secret:speediance-platform/dev/users/alice/speediance-abc',
      }),
    });
    const store = createSecretsStore({ stage: 'dev', client });
    const result = await store.put('alice', VALID_SECRET);
    expect(result.arn).toContain('alice');
    expect(calls[0]?.command).toBe('CreateSecretCommand');
    const input = calls[0]?.input as { Name: string; SecretString: string };
    expect(input.Name).toBe('speediance-platform/dev/users/alice/speediance');
    const stored = JSON.parse(input.SecretString) as { email: string };
    expect(stored.email).toBe('user@example.com');
  });

  it('falls back to PutSecretValue when the secret already exists', async () => {
    const { client, calls } = mockClient({
      CreateSecretCommand: () => {
        throw new ResourceExistsException({ message: 'exists', $metadata: {} });
      },
      PutSecretValueCommand: () => ({
        ARN: 'arn:aws:secretsmanager:us-west-2:1:secret:speediance-platform/dev/users/alice/speediance-abc',
      }),
    });
    const store = createSecretsStore({ stage: 'dev', client });
    const result = await store.put('alice', VALID_SECRET);
    expect(result.arn).toContain('alice');
    expect(calls.map((c) => c.command)).toEqual(['CreateSecretCommand', 'PutSecretValueCommand']);
  });

  it('rejects invalid secret payloads at validation time', async () => {
    const { client } = mockClient({});
    const store = createSecretsStore({ stage: 'dev', client });
    await expect(
      store.put('alice', {
        ...VALID_SECRET,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        email: 'not-an-email' as any,
      }),
    ).rejects.toThrow();
  });
});

describe('delete', () => {
  it('schedules deletion with 7-day recovery window by default', async () => {
    const { client, calls } = mockClient({ DeleteSecretCommand: () => ({}) });
    const store = createSecretsStore({ stage: 'dev', client });
    await store.delete('alice');
    expect(calls[0]?.command).toBe('DeleteSecretCommand');
    const input = calls[0]?.input as {
      RecoveryWindowInDays?: number;
      ForceDeleteWithoutRecovery?: boolean;
    };
    expect(input.RecoveryWindowInDays).toBe(7);
    expect(input.ForceDeleteWithoutRecovery).toBeUndefined();
  });

  it('force-deletes when opts.force=true', async () => {
    const { client, calls } = mockClient({ DeleteSecretCommand: () => ({}) });
    const store = createSecretsStore({ stage: 'dev', client });
    await store.delete('alice', { force: true });
    const input = calls[0]?.input as {
      RecoveryWindowInDays?: number;
      ForceDeleteWithoutRecovery?: boolean;
    };
    expect(input.ForceDeleteWithoutRecovery).toBe(true);
    expect(input.RecoveryWindowInDays).toBeUndefined();
  });

  it('treats NotFound as idempotent success', async () => {
    const { client } = mockClient({
      DeleteSecretCommand: () => {
        throw new ResourceNotFoundException({ message: 'not found', $metadata: {} });
      },
    });
    const store = createSecretsStore({ stage: 'dev', client });
    await expect(store.delete('alice')).resolves.toBeUndefined();
  });
});
