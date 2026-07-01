import { defineConfig } from 'vitest/config'

export default defineConfig({
  // NOTE: vitest 4 transforms TS with oxc (not esbuild), and oxc ignores an
  // `esbuild.tsconfigRaw` override. To stop oxc walking up to the root
  // tsconfig.json — whose project references (./website → astro/tsconfigs/strict)
  // are absent in CI's root-only npm install — scripts/ ships its own
  // self-contained scripts/tsconfig.json, which oxc resolves as the nearest
  // tsconfig for scripts/**/*.test.ts. [T001360, supersedes T001323's esbuild trick]
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
})
