import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'web'),
  plugins: [react()],
  resolve: {
    alias: { '$lib': resolve(__dirname, 'web/src/lib') },
  },
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8092',
    },
  },
});
