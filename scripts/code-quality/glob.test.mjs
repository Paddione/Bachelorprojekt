import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGlob } from './glob.mjs';

test('matchGlob: ** matches across slashes', () => {
  assert.equal(matchGlob('website/src/lib/db.ts', 'website/**'), true);
  assert.equal(matchGlob('website/src/lib/db.ts', 'website/src/**'), true);
  assert.equal(matchGlob('scripts/datamodel/db.py', 'scripts/datamodel/**'), true);
});

test('matchGlob: * does not cross a slash', () => {
  assert.equal(matchGlob('k3d/foo.yaml', 'k3d/*.yaml'), true);
  assert.equal(matchGlob('k3d/sub/foo.yaml', 'k3d/*.yaml'), false);
});

test('matchGlob: exact single-file glob', () => {
  assert.equal(matchGlob('website/src/lib/system-test-seed-data.ts',
    'website/src/lib/system-test-seed-data.ts'), true);
  assert.equal(matchGlob('website/src/lib/other.ts',
    'website/src/lib/system-test-seed-data.ts'), false);
});

test('matchGlob: non-match outside the prefix', () => {
  assert.equal(matchGlob('docs/readme.md', 'website/**'), false);
});

test('matchGlob: regex metacharacters in path are literal', () => {
  assert.equal(matchGlob('website/src/pages/admin/projekte/[id].astro',
    'website/**'), true);
});
