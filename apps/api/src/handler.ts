import { handle } from 'hono/aws-lambda';

import { app } from './index.js';

/**
 * AWS Lambda entry point. `handle()` adapts API Gateway / Function URL
 * events to the Web-standard Request the Hono app expects, and the
 * Response it returns to the Lambda result shape.
 *
 * Function URLs (which is what SST wires up for `sst.aws.Function` when
 * `url: true`) emit APIGatewayProxyEventV2-shaped events.
 *
 * Wire-up lives in `infra/stacks/Api.ts` — change the path there if you
 * rename this file.
 */
export const handler = handle(app);
