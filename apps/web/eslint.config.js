import base from '@speediance/eslint-config';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Next.js's own lint rules attach via `next lint`; we keep our base
      // TypeScript rules in addition.
    },
  },
];
