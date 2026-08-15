// brett/test/no-eager-three.test.ts — Phase A / A5
// Enforces the lazy-mount architecture node-side: main.ts must NOT statically
// import Three.js or the scene/board, and MUST dynamic-import board-boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(
  fileURLToPath(new URL('../src/client/main.ts', import.meta.url)),
  'utf8',
);

test('main.ts has NO static import of three / scene / board-boot', () => {
  assert.doesNotMatch(mainSrc, /import\s[^\n]*from\s+['"]three['"]/, 'no static three import');
  assert.doesNotMatch(mainSrc, /import\s[^\n]*from\s+['"]\.\/scene['"]/, 'no static ./scene import');
  assert.doesNotMatch(mainSrc, /import\s[^\n]*from\s+['"]\.\/board-boot['"]/, 'no static ./board-boot import');
});

test('main.ts dynamic-imports board-boot (lazy mount)', () => {
  assert.match(mainSrc, /import\(\s*['"]\.\/board-boot['"]\s*\)/, 'must dynamic import(./board-boot)');
});
