import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineCount, evalFile, runS1 } from './s1-filesize.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('lineCount counts newlines + a final partial line', () => {
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount(''), 0);
});

test('evalFile flags an over-limit file and shapes a violation', () => {
  const limits = { '.ts': 100 };
  const v = evalFile('website/src/big.ts', 150, limits, []);
  assert.deepEqual(v, {
    key: 'S1:website/src/big.ts',
    path: 'website/src/big.ts',
    metric: 150,
    detail: '150 lines > 100 limit (.ts)',
  });
});

test('evalFile returns null for an under-limit file', () => {
  assert.equal(evalFile('website/src/ok.ts', 80, { '.ts': 100 }, []), null);
});

test('evalFile returns null for an ignored file', () => {
  assert.equal(evalFile('seed.ts', 9999, { '.ts': 100 }, ['seed.ts']), null);
});

test('evalFile returns null for an extension with no limit', () => {
  assert.equal(evalFile('a.md', 9999, { '.ts': 100 }, []), null);
});

test('runS1 over the real repo returns the documented contract shape', () => {
  const res = runS1(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S1');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S1:'));
    assert.equal(typeof v.metric, 'number');
    assert.equal(v.key, `S1:${v.path}`);
  }
  // Both website-db.ts and system-test-seed-data.ts are in the S1 ignore list
  // (sanctioned exceptions — see gates.yaml s1.ignore).
  const keys = new Set(res.violations.map((v) => v.key));
  assert.ok(!keys.has('S1:website/src/lib/website-db.ts'));
  assert.ok(!keys.has('S1:website/src/lib/system-test-seed-data.ts'));
});
