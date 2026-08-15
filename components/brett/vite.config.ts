import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        share: resolve(__dirname, 'public/share.html'),
        zuschauer: resolve(__dirname, 'public/zuschauer.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/presets': 'http://localhost:3000',
      '/share': 'http://localhost:3000',
      '/zuschauer': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/sync': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
