import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: __dirname,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    env: {
      VOYAGE_API_KEY: 'test-key',
    },
  },
});
