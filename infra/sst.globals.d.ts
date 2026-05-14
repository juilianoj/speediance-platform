// Minimal stub of the SST Ion globals so `tsc` is green BEFORE the user runs
// `sst install` (which generates `.sst/platform/config.d.ts` with the real,
// strongly-typed defs). The triple-slash reference in `sst.config.ts` points
// at the SST-generated file; once it exists, it shadows these stubs.
//
// Keep this file intentionally loose — `unknown` everywhere so we don't trick
// ourselves into writing code that relies on the wrong shape.

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  const $config: <T>(config: T) => T;
  const $app: { stage: string; name: string };

  namespace sst {
    namespace aws {
      class Dynamo {
        constructor(name: string, args?: any);
        readonly name: any;
        readonly arn: any;
      }
      class CognitoUserPool {
        constructor(name: string, args?: any);
        readonly id: any;
        readonly arn: any;
        addClient(name: string, args?: any): CognitoUserPoolClient;
      }
      class CognitoUserPoolClient {
        constructor(name: string, args?: any);
        readonly id: any;
      }
      class Function {
        constructor(name: string, args?: any);
        readonly name: any;
        // `arn` is what the real `sst.aws.Function` exposes. Don't add
        // `functionArn` back to this stub — it doesn't exist on the real
        // class, and references that compile against the stub will explode
        // at deploy time (the value resolves to `undefined`).
        readonly arn: any;
        // `url` is populated when the Function is created with `url: true`
        // (SST wires up a Lambda Function URL). Type-loose because the
        // real shape is `Output<string | undefined>`.
        readonly url: any;
      }
      class Cron {
        constructor(name: string, args?: any);
      }
      class Router {
        constructor(name: string, args?: any);
        readonly url: any;
      }
      class Nextjs {
        constructor(name: string, args?: any);
        readonly url: any;
      }
    }
    class Secret {
      constructor(name: string, defaultValue?: string);
      readonly value: any;
    }
  }
}

export {};
