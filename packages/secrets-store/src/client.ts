import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

let cached: SecretsManagerClient | undefined;

export function getSecretsClient(region?: string): SecretsManagerClient {
  if (cached) return cached;
  cached = new SecretsManagerClient({
    region: region ?? process.env.AWS_REGION ?? 'us-west-2',
  });
  return cached;
}

/** Test-only override. */
export function __setSecretsClient(c: SecretsManagerClient | undefined): void {
  cached = c;
}
