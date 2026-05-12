import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.sst/**',
      '**/node_modules/**',
      '**/build/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Phase 0.4 / audit M4: anyone reading or writing tenant data MUST do
      // so through @speediance/db's `forUser(userId)` wrapper, which Omit-s
      // userId from every input. Direct DynamoDB / ElectroDB usage outside
      // the db package bypasses that enforcement and risks cross-user reads.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@aws-sdk/client-dynamodb',
              message:
                'Use @speediance/db (createDb().forUser(userId)) instead of the raw DynamoDB client.',
            },
            {
              name: '@aws-sdk/lib-dynamodb',
              message:
                'Use @speediance/db (createDb().forUser(userId)) instead of the raw DynamoDB client.',
            },
            {
              name: 'electrodb',
              message:
                'Use @speediance/db (createDb().forUser(userId)) — defining new entities lives in packages/db/src/entities.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
