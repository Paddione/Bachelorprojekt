import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
    port: 4322,
  },
  i18n: {
    defaultLocale: 'de',
    locales: ['de'],
  },
  security: {
    checkOrigin: false,
  },
});
