import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceExistsException,
  ResourceNotFoundException,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import { getSecretsClient } from './client.js';
import { secretName, SpeedianceSecretSchema, type SpeedianceSecret } from './secret.js';

export interface SecretsStoreOptions {
  /** SST stage (dev, prod, etc.) — used to namespace the secret name so a
   *  dev deploy never reads from / writes to prod secrets and vice versa. */
  stage: string;
  client?: SecretsManagerClient;
}

export interface SecretsStore {
  /** Returns the user's Speediance secret, or null if they haven't set it up
   *  yet. Never throws on "not found" — that's a legitimate state for users
   *  who signed up but haven't visited the Profile page. */
  get(userId: string): Promise<SpeedianceSecret | null>;

  /** Creates the secret if it doesn't exist, updates it if it does. Returns
   *  the secret's ARN for storage on the user's profile (`speedianceSecretArn`
   *  field on the Profile DynamoDB item). */
  put(userId: string, value: SpeedianceSecret): Promise<{ arn: string }>;

  /** Schedules the secret for deletion with a 7-day recovery window — the
   *  AWS default. Set `force: true` for an immediate, non-recoverable delete
   *  (only used when the user is being fully off-boarded). */
  delete(userId: string, opts?: { force?: boolean }): Promise<void>;
}

export function createSecretsStore(opts: SecretsStoreOptions): SecretsStore {
  const stage = opts.stage;
  if (!stage || typeof stage !== 'string') {
    throw new TypeError('createSecretsStore: stage must be a non-empty string');
  }
  const client = opts.client ?? getSecretsClient();

  return {
    async get(userId) {
      if (!userId) throw new TypeError('secrets-store.get: userId is required');
      const name = secretName(stage, userId);
      try {
        const resp = await client.send(new GetSecretValueCommand({ SecretId: name }));
        if (!resp.SecretString) return null;
        const parsed = SpeedianceSecretSchema.safeParse(JSON.parse(resp.SecretString));
        if (!parsed.success) {
          // Stored secret doesn't conform — could be a partial/legacy value.
          // Surface as null so the caller treats it like "not set up" and
          // re-prompts; the bad data is left in place for forensics.
          console.error('Stored secret failed validation', parsed.error.format());
          return null;
        }
        return parsed.data;
      } catch (err) {
        if (err instanceof ResourceNotFoundException) return null;
        throw err;
      }
    },

    async put(userId, value) {
      if (!userId) throw new TypeError('secrets-store.put: userId is required');
      const validated = SpeedianceSecretSchema.parse(value);
      const name = secretName(stage, userId);
      const SecretString = JSON.stringify(validated);
      try {
        const created = await client.send(
          new CreateSecretCommand({
            Name: name,
            Description: `Speediance credentials for user ${userId} (${stage})`,
            SecretString,
          }),
        );
        if (!created.ARN) throw new Error('CreateSecret returned no ARN');
        return { arn: created.ARN };
      } catch (err) {
        if (err instanceof ResourceExistsException) {
          // The secret already exists — push the new value as a fresh version.
          // Reading the ARN back via GetSecretValue is cheaper than DescribeSecret.
          const updated = await client.send(
            new PutSecretValueCommand({ SecretId: name, SecretString }),
          );
          if (!updated.ARN) throw new Error('PutSecretValue returned no ARN');
          return { arn: updated.ARN };
        }
        throw err;
      }
    },

    async delete(userId, opts) {
      if (!userId) throw new TypeError('secrets-store.delete: userId is required');
      const name = secretName(stage, userId);
      try {
        await client.send(
          new DeleteSecretCommand({
            SecretId: name,
            ForceDeleteWithoutRecovery: opts?.force,
            RecoveryWindowInDays: opts?.force ? undefined : 7,
          }),
        );
      } catch (err) {
        // Idempotent delete — already gone is fine.
        if (err instanceof ResourceNotFoundException) return;
        throw err;
      }
    },
  };
}
