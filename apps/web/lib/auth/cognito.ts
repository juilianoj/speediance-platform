import 'server-only';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

/** Cognito IDs are not secrets — they're public identifiers embedded in every
 *  AWS-Amplify-style client. Reading them on the server keeps the auth flow
 *  entirely server-side so tokens never enter the browser's JS memory. */
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

let cachedConfig: CognitoConfig | undefined;
let cachedClient: CognitoIdentityProviderClient | undefined;

export function getCognitoConfig(): CognitoConfig {
  if (cachedConfig) return cachedConfig;
  const region = process.env.AWS_REGION ?? 'us-west-2';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.COGNITO_USER_POOL_CLIENT_ID;
  if (!userPoolId || !userPoolClientId) {
    throw new Error(
      'COGNITO_USER_POOL_ID and COGNITO_USER_POOL_CLIENT_ID must be set. ' +
        'They are wired in infra/stacks/Web.ts and resolved from the Auth stack outputs.',
    );
  }
  cachedConfig = { region, userPoolId, userPoolClientId };
  return cachedConfig;
}

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (cachedClient) return cachedClient;
  const { region } = getCognitoConfig();
  cachedClient = new CognitoIdentityProviderClient({ region });
  return cachedClient;
}
