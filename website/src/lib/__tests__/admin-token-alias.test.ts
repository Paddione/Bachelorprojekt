import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../styles/admin-foundation.css'), 'utf8');

const COLOR_TOKENS = [
  '--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-surface-hover',
  '--admin-border', '--admin-border-bright', '--admin-primary', '--admin-primary-muted',
  '--admin-accent', '--admin-text', '--admin-text-mute', '--admin-text-disabled',
  '--admin-success', '--admin-danger', '--admin-info', '--admin-warning',
];

describe('admin-foundation token alias layer', () => {
  for (const token of COLOR_TOKENS) {
    it(`${token} aliases a factory-tokens var()`, () => {
      const m = css.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(m, `${token} must be declared`).toBeTruthy();
      const value = (m![1] ?? '').trim();
      expect(value.startsWith('var(--')).toBe(true);
    });
  }
});
