import base from '@speediance/eslint-config';

export default [
  ...base,
  {
    // The stdio entrypoint needs `console.log` to surface boot diagnostics
    // on stderr (stdout is reserved for MCP JSON-RPC). The base config only
    // warns on `console.log`; tests + src here are pure data plumbing.
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {},
  },
];
