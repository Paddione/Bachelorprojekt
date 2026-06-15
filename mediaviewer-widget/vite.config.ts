import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [react()],
      resolve: {
        alias: {
          '@videovault-player': path.resolve(__dirname, '..', 'packages', 'videovault-player', 'src'),
        },
      },
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src', 'lib-entry.ts'),
          name: 'MediaviewerWidget',
          formats: ['es'],
          fileName: 'index',
        },
        outDir: 'dist/lib',
        emptyOutDir: true,
        rollupOptions: {
          external: ['react', 'react-dom', '@korczewski/videovault-player'],
        },
      },
    };
  }

  // App mode (dev)
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@videovault-player': path.resolve(__dirname, '..', 'packages', 'videovault-player', 'src'),
      },
    },
    server: {
      port: 5300,
    },
    build: {
      outDir: 'dist/app',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          embed: path.resolve(__dirname, 'embed.html'),
        },
      },
    },
  };
});
