import base from '@speediance/eslint-config';

export default [
  ...base,
  {
    files: ['sst.config.ts', 'stacks/**/*.ts'],
    languageOptions: {
      globals: {
        // SST Ion globals — populated by `sst install` into .sst/platform/.
        $config: 'readonly',
        $app: 'readonly',
        sst: 'readonly',
      },
    },
    rules: {
      // The stub globals declare these as `any`; suppress the resulting
      // unsafe-any warnings until SST install replaces the stubs.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
    },
  },
];
