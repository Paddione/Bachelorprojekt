// brett/test/no-hardcoded-brand-css.test.ts — Phase A / A6
// The status-pill + fig-panel CSS blocks must be re-skinned onto brett tokens:
// they reference var(--brett-*) and contain NONE of the legacy brand literals.
// Scoped to those rule blocks — the appearance-drawer keeps its hex until Phase E.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(
  fileURLToPath(new URL('../public/index.html', import.meta.url)),
  'utf8',
);

/** Extract a single CSS rule block `selector { … }` from the inline <style>. */
function ruleBlock(selector: string): string {
  const idx = html.indexOf(selector + ' {');
  const idx2 = idx === -1 ? html.indexOf(selector + '{') : idx;
  assert.notEqual(idx2, -1, `rule block for "${selector}" not found`);
  const open = html.indexOf('{', idx2);
  const close = html.indexOf('}', open);
  return html.slice(open, close + 1);
}

const LEGACY = ['#0e1014', '#161a22', '#c8a96e'];

for (const sel of ['#status-pill', '#fig-panel', '#fig-panel-add']) {
  test(`${sel} uses brett tokens and no legacy brand hex`, () => {
    const block = ruleBlock(sel);
    assert.ok(block.includes('var(--brett-'), `${sel} must reference var(--brett-*)`);
    for (const hex of LEGACY) {
      assert.ok(!block.toLowerCase().includes(hex), `${sel} must not contain legacy ${hex}`);
    }
  });
}
