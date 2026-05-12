import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cachedClient: DynamoDBDocumentClient | undefined;

/** Returns a singleton DynamoDB document client. Lambda execution contexts
 *  reuse the same connection across invocations; without caching we'd open
 *  a new socket per request, which adds ~50ms cold-start. */
export function getDynamoClient(region?: string): DynamoDBDocumentClient {
  if (cachedClient) return cachedClient;
  const raw = new DynamoDBClient({
    region: region ?? process.env.AWS_REGION ?? 'us-west-2',
  });
  cachedClient = DynamoDBDocumentClient.from(raw, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
  return cachedClient;
}

/** Test-only: swap the cached client out so tests can inject a mock. */
export function __setDynamoClient(client: DynamoDBDocumentClient | undefined): void {
  cachedClient = client;
}
