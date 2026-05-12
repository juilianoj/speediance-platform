/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Workspace packages export from `src/index.ts` directly (not from a
  // pre-built `dist/`) so `tsc --noEmit` resolves their types without a
  // build step. `transpilePackages` tells Next.js to compile those source
  // files through SWC instead of expecting pre-compiled JS.
  transpilePackages: [
    '@speediance/db',
    '@speediance/secrets-store',
    '@speediance/speediance-client',
  ],

  // Our tsconfig uses `moduleResolution: "Bundler"`, which makes the
  // TypeScript-ESM convention `import './foo.js'` legal even when `foo.ts`
  // is the source file. The extensionAlias below tells webpack to resolve
  // `.js`/`.mjs`/`.cjs` import specifiers against their TypeScript siblings.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
