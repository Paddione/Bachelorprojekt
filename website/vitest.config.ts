import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  test: {
    root: __dirname,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    env: {
      VOYAGE_API_KEY: 'test-key',
    },
    globals: true,
    setupFiles: ['./src/lib/__tests__/setup.ts'],
  },
});
