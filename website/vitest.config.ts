import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Two projects so Svelte component/store tests get a browser (jsdom) environment
// without forcing jsdom + browser export-conditions onto node-oriented tests
// (jose/livekit JWT signing, pdf-lib, etc. break under jsdom/browser conditions).
const COMPONENT_TESTS = [
  'src/components/**/*.{test,spec}.ts',
  'src/lib/stores/cockpitStore.test.ts',
  'src/lib/factory-floor.order.test.ts',
  // Client-only rrweb recorder — touches window/document/navigator directly.
  'src/lib/systemtest/recorder.test.ts',
];

export default defineConfig({
  test: {
    root: __dirname,
    globals: true,
    testTimeout: 10000,
    // In CI, add the built-in github-actions reporter (inline PR annotations
    // on failing tests, no extra tooling) and a JUnit report (uploaded as an
    // artifact by the workflow) for failure-history/duration tracking.
    // Local runs keep the plain default reporter.
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', 'github-actions', ['junit', { outputFile: './test-results/junit.xml' }]]
      : ['default'],
    env: {
      VOYAGE_API_KEY: 'test-key',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/.generated.*',
        '**/*.d.ts',
        'vitest.config.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { lines: 80 },
      reportOnFailure: true,
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/**/*.{test,spec}.ts',
            'tests/**/*.{test,spec}.ts',
            '../scripts/openspec-embed.test.mjs',
          ],
          exclude: ['node_modules/**', 'dist/**', ...COMPONENT_TESTS],
          globals: true,
          env: { VOYAGE_API_KEY: 'test-key' },
        },
      },
      {
        plugins: [svelte()],
        resolve: {
          conditions: ['browser'],
        },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: COMPONENT_TESTS,
          exclude: ['node_modules/**', 'dist/**'],
          globals: true,
          env: { VOYAGE_API_KEY: 'test-key' },
          setupFiles: ['./src/lib/__tests__/setup.ts'],
        },
      },
    ],
  },
});
