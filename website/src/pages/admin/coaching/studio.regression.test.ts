import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// T001784: the coaching studio page used to pull React + Babel from a third-party CDN
// (unpkg) and transpile .jsx in the browser. That leaked the admin's IP to unpkg (DSGVO /
// on-premises breach) and shipped React dev builds + ~1 MB Babel to production. On top of
// that the source .jsx were corrupt (a leaked heredoc marker made screens_core.jsx invalid
// JS), so the studio crashed anyway. The page must load nothing external; the feature is
// disabled behind an honest placeholder until it is rebuilt or removed (follow-up T001792).
const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(resolve(here, 'studio.astro'), 'utf8');

describe('coaching studio loads nothing from an external CDN (T001784)', () => {
  it('references no third-party CDN and runs no in-browser Babel', () => {
    expect(astro).not.toMatch(/unpkg\.com/);
    expect(astro).not.toMatch(/cdn\.jsdelivr|cdnjs\.cloudflare|esm\.sh|skypack/);
    expect(astro).not.toMatch(/@babel\/standalone/);
    expect(astro).not.toMatch(/type=["']text\/babel["']/);
  });

  it('no longer wires up the corrupt browser-transpiled .jsx bundle', () => {
    expect(astro).not.toMatch(/coaching-studio\/\w+\.jsx/);
    expect(astro).not.toMatch(/id=["']root["']/);
  });

  it('shows an honest disabled placeholder', () => {
    expect(astro).toMatch(/nicht verfügbar/);
  });
});
