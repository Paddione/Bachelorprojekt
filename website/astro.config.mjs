import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte(), react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '$lib': path.resolve(__dirname, 'src/lib'),
      },
    },
  },
  server: { host: true, port: 4321 },
  i18n: { defaultLocale: 'de', locales: ['de'] },
  security: { checkOrigin: false },
});
