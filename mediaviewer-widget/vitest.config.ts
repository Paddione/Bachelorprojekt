import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'react', replacement: path.resolve(__dirname, 'node_modules', 'react') },
      { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules', 'react-dom') },
      { find: '@videovault-player', replacement: path.resolve(__dirname, '..', 'packages', 'videovault-player', 'src') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
});
