import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrphans, runS4 } from './s4-orphans.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('findOrphans flags a candidate whose basename is in no source', () => {
  const candidates = ['a/referenced.sh', 'a/orphan.sh'];
  const corpus = 'cmds:\n  - bash a/referenced.sh\n';
  const orphans = findOrphans(candidates, corpus);
  assert.deepEqual(orphans, ['a/orphan.sh']);
});

test('findOrphans is basename-based (path may differ in the reference)', () => {
  const candidates = ['scripts/foo.sh'];
  const corpus = 'source "${DIR}/foo.sh"';
  assert.deepEqual(findOrphans(candidates, corpus), []);
});

test('runS4 over real repo returns documented contract shape', () => {
  const res = runS4(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S4');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S4:'));
    assert.equal(v.metric, 1);
    assert.equal(v.key, `S4:${v.path}`);
  }
  // allowlisted bootstrap manifests never appear:
  assert.ok(!res.violations.some((v) => v.path === 'k3d/sealed-secrets-controller.yaml'));
  assert.ok(!res.violations.some((v) => v.path.startsWith('k3d/office-stack/')));
});
