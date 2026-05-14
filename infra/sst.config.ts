// SST Ion config. Resources are defined in ./stacks/* and assembled here.
//
// The real SST types live in `.sst/platform/config.d.ts` once you've run
// `sst install`. Until then we rely on the loose stub in ./sst.globals.d.ts
// (already picked up via tsconfig include). When SST is installed it adds a
// triple-slash reference to its own config.d.ts here automatically.
// Each stack module exports a `register(args)` function so cross-stack
// dependencies are explicit (e.g. SyncWorker needs the table from Database).
//
// Phase 0.2 acceptance: `sst deploy --stage dev` succeeds against a personal
// AWS account. Subsequent phases (0.3 Auth, 0.4 Database, 1.x SyncWorker)
// fill in the actual resources.

export default $config({
  app(input: { stage?: string } | undefined) {
    return {
      name: 'speediance-platform',
      removal: input?.stage === 'prod' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: { region: 'us-west-2' },
      },
    };
  },

  async run() {
    const { Database } = await import('./stacks/Database');
    const { Auth } = await import('./stacks/Auth');
    const { Api } = await import('./stacks/Api');
    const { SyncWorker } = await import('./stacks/SyncWorker');
    const { Web } = await import('./stacks/Web');

    const database = Database();
    const auth = Auth();
    const api = Api({ database, auth });
    const syncWorker = SyncWorker({ database });
    const web = Web({ api, auth, database, syncWorker });

    return {
      tableName: database.table.name,
      userPoolId: auth.userPool.id,
      userPoolClientId: auth.userPoolClient.id,
      apiUrl: api.url,
      mcpUrl: api.mcpUrl,
      webUrl: web.url,
      syncWorkerArn: syncWorker.functionArn,
    };
  },
});
