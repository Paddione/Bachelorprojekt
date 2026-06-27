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
];

export default defineConfig({
  test: {
    root: __dirname,
    globals: true,
    env: {
      VOYAGE_API_KEY: 'test-key',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/**/*.spec.ts',
        'src/lib/**/__tests__/**',
        'src/lib/**/*.generated.*',
        'src/lib/**/*.d.ts',
      ],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: { lines: 60 },
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
