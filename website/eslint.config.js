import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  { ignores: [
    'dist/', '.astro/', '.design-sync/', '.ds-sync/', 'node_modules/', '**/*.generated.*',
    'src/pages/admin/coaching/sessions/index.astro',
    'src/pages/admin/einstellungen/ordner-templates.astro',
    'src/pages/admin/kalender.astro',
    'src/pages/admin/steuer.astro',
    'src/pages/admin/systemtest/board.astro',
    'src/pages/admin/termine.astro',
  ] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  ...astro.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'svelte/require-each-key': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'svelte/prefer-svelte-reactivity': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'no-empty': 'off',
      'svelte/no-at-html-tags': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'svelte/no-unused-svelte-ignore': 'off',
      'svelte/no-useless-mustaches': 'off',
      'svelte/infinite-reactive-loop': 'off',
      'svelte/prefer-writable-derived': 'off',
      'svelte/no-object-in-text-mustaches': 'off',
      'svelte/no-immutable-reactive-statements': 'off',
      'svelte/no-dom-manipulating': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.mjs', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    languageOptions: { globals: { ...globals.vitest } },
  },
);
