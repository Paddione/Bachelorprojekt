import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(here, '../../styles');
const globalCss = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');

// After the consolidation, every semantic admin color token is a thin alias of a
// Tailwind @theme --color-* token, declared in exactly one source (global.css).
const COLOR_TOKENS = [
  '--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-surface-hover',
  '--admin-border', '--admin-border-bright', '--admin-primary', '--admin-primary-muted',
  '--admin-accent', '--admin-text', '--admin-text-mute', '--admin-text-disabled',
  '--admin-success', '--admin-danger', '--admin-info', '--admin-warning',
];

describe('admin color tokens alias the Tailwind @theme layer', () => {
  for (const token of COLOR_TOKENS) {
    it(`${token} aliases a @theme --color-* var in global.css`, () => {
      const m = globalCss.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(m, `${token} must be declared in global.css`).toBeTruthy();
      const value = (m![1] ?? '').trim();
      expect(value).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    });
  }

  it('factory-tokens.css is dissolved — no second :root color source', () => {
    expect(existsSync(resolve(stylesDir, 'factory-tokens.css'))).toBe(false);
  });
});
