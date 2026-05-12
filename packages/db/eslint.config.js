import base from '@speediance/eslint-config';

export default [
  ...base,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // packages/db IS the boundary. AWS SDK / ElectroDB imports are
      // expected here; the rule only blocks them elsewhere.
      'no-restricted-imports': 'off',
    },
  },
];
