/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Our tsconfig uses `moduleResolution: "Bundler"`, which makes the
  // TypeScript-ESM convention `import './foo.js'` legal even when `foo.ts`
  // is the source file. `tsc --noEmit` is fine with this; Next.js's webpack
  // is not, by default. The extensionAlias below tells webpack to resolve
  // `.js`/`.mjs`/`.cjs` import specifiers against their TypeScript siblings
  // — same trick the broader TS ecosystem uses.
  //
  // Why we keep the `.js` in source: the rest of our workspace
  // (packages/db, packages/speediance-client) emits real .js artifacts and
  // those imports must keep the extension to satisfy ESM at runtime. We'd
  // rather have one consistent pattern than divergent rules per package.
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
