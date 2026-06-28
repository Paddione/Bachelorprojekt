import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    // Prevent vite:esbuild from scanning workspace tsconfig.json references
    // (root tsconfig.json references ./website which extends astro/tsconfigs/strict —
    // only installed in website/node_modules, absent from root node_modules in CI).
    // Added after PR #2312 introduced the composite build reference. [T001323]
    tsconfigRaw: '{}',
  },
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
})
