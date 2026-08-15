import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.tsx'],
    css: true,
  },
  resolve: {
    alias: [
      { find: /^.*\.svg\?react$/, replacement: path.resolve(__dirname, './src/test/svg-stub.tsx') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
