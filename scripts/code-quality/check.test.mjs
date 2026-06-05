import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockingSet } from './check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
// cfgDir override is repoRoot-relative (matches the CLI's QUALITY_CFG_DIR join).
const badGatesCfg = 'scripts/code-quality/fixtures/bad-gates';

const baseline = {
  'S1:a.ts': { gate: 'S1', path: 'a.ts', metric: 612, detail: 'x', frozen_at: 'abc' },
  'S3:b.yaml:files.mentolder.de': { gate: 'S3', path: 'b.yaml', metric: 1, detail: 'x', frozen_at: 'abc' },
};

test('a brand-new violation is blocking', () => {
  const current = [
    { key: 'S1:a.ts', metric: 612 },
    { key: 'S1:new.ts', metric: 700 },
  ];
  const blk = blockingSet(current, baseline);
  assert.deepEqual(blk.map((v) => v.key), ['S1:new.ts']);
});

test('a known baseline violation at the same metric is NOT blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 612 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});

test('a worsened known violation (metric up) is blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 650 }];
  assert.deepEqual(blockingSet(current, baseline).map((v) => v.key), ['S1:a.ts']);
});

test('an improved known violation (metric down) is NOT blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 500 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});

test('a binary (metric=1) known violation cannot worsen', () => {
  const current = [{ key: 'S3:b.yaml:files.mentolder.de', metric: 1 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});

/** Spawn a code-quality CLI with QUALITY_CFG_DIR pointed at a fixture cfgDir. */
function runCli(script, cfgDir) {
  return spawnSync(process.execPath, [join(here, script)], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, QUALITY_CFG_DIR: cfgDir },
  });
}

test('check.mjs validates-first and hard-exits non-zero on a malformed gates.yaml', () => {
  // bad-gates has a valid registry but an s2.graphs entry missing `tsconfig` —
  // validateRegistry must reject it BEFORE any gate runs, failing closed.
  const r = runCli('check.mjs', badGatesCfg);
  assert.notEqual(r.status, 0, `expected non-zero exit, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /tsconfig/, `expected validate error on stderr, got: ${r.stderr}`);
});

test('freeze.mjs validates-first and hard-exits non-zero on a malformed gates.yaml', () => {
  // Same fail-closed guard for the freeze path: never bake an empty/false-clean
  // baseline from a malformed config.
  const r = runCli('freeze.mjs', badGatesCfg);
  assert.notEqual(r.status, 0, `expected non-zero exit, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /tsconfig/, `expected validate error on stderr, got: ${r.stderr}`);
});
