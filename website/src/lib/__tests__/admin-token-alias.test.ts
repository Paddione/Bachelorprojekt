import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(here, '../../styles');

// After the consolidation, every semantic admin color token is a thin alias of a
// Tailwind @theme --color-* token, declared in exactly one source (global.css).
const COLOR_TOKENS = [
  '--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-surface-hover',
  '--admin-border', '--admin-border-bright', '--admin-primary', '--admin-primary-muted',
  '--admin-accent', '--admin-text', '--admin-text-mute', '--admin-text-disabled',
  '--admin-success', '--admin-danger', '--admin-info', '--admin-warning',
];

describe('admin color tokens alias the Tailwind @theme layer', () => {
  const factoryCss = readFileSync(resolve(stylesDir, 'factory-tokens.css'), 'utf8');

  for (const token of COLOR_TOKENS) {
    it(`${token} aliases a @theme --color-* var in factory-tokens.css`, () => {
      const m = factoryCss.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(m, `${token} must be declared in factory-tokens.css`).toBeTruthy();
      const value = (m![1] ?? '').trim();
      expect(value).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    });
  }

  it('factory-tokens.css exists', () => {
    expect(existsSync(resolve(stylesDir, 'factory-tokens.css'))).toBe(true);
  });
});
