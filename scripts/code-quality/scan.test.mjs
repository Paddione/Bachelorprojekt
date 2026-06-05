import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUniverse, ownerOf } from './scan.mjs';
import { loadSubsystems, loadGates } from './load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('scanUniverse returns tracked files under code_roots minus ignores', () => {
  const gates = loadGates(cfgDir);
  const files = scanUniverse(repoRoot, gates);
  assert.ok(files.length > 1000, `expected a large scan set, got ${files.length}`);
  // ignore_globs honoured:
  assert.ok(!files.includes('website/src/lib/system-test-seed-data.ts'));
  assert.ok(!files.some((f) => f.startsWith('k3d/docs-content-built/')));
  // gate-test fixtures are ignored (Finding-3 fix): they never perturb the index.
  assert.ok(!files.some((f) => f.startsWith('scripts/code-quality/fixtures/')));
  // outside code_roots excluded:
  assert.ok(!files.includes('task.sh'));
  assert.ok(!files.some((f) => f.startsWith('.github/')));
  // a real in-scope file present:
  assert.ok(files.includes('docs/code-quality/subsystems.yaml') === false);
  assert.ok(files.some((f) => f.startsWith('website/src/')));
});

test('ownerOf resolves by first-match order', () => {
  const subs = loadSubsystems(cfgDir);
  // tests beats website
  assert.equal(ownerOf('website/test/foo.ts', subs)?.id, 'tests');
  // scripts-db beats scripts-infra
  assert.equal(ownerOf('scripts/datamodel/db.py', subs)?.id, 'scripts-db');
  assert.equal(ownerOf('scripts/migrate.sh', subs)?.id, 'scripts-infra');
  // plain website
  assert.equal(ownerOf('website/src/lib/db.ts', subs)?.id, 'website');
  // unowned
  assert.equal(ownerOf('docs/readme.md', subs), undefined);
});
