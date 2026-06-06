import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/presets': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/sync': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
