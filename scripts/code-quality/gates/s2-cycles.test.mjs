import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonCycle, cyclesToViolations, runS2 } from './s2-cycles.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('canonCycle is rotation- and order-invariant', () => {
  const a = canonCycle(['b.ts', 'c.ts', 'a.ts']);
  const b = canonCycle(['c.ts', 'a.ts', 'b.ts']);
  const c = canonCycle(['a.ts', 'b.ts', 'c.ts']);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, 'a.ts|b.ts|c.ts');
});

test('cyclesToviolations shapes keys and metrics per graph', () => {
  const vs = cyclesToViolations('website', 'website/src', [
    ['b.ts', 'a.ts'],
    ['x.ts', 'y.ts', 'z.ts'],
  ]);
  assert.deepEqual(vs.map((v) => v.key), [
    'S2:website:a.ts|b.ts',
    'S2:website:x.ts|y.ts|z.ts',
  ]);
  assert.deepEqual(vs.map((v) => v.metric), [2, 3]);
  assert.equal(vs[0].path, 'website/src');
});

test('runS2 returns the documented contract shape on the real tree', () => {
  const res = runS2(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S2');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S2:'));
    assert.equal(typeof v.metric, 'number');
  }
});

test('S2 keys are machine-independent: no canon member is absolute or contains repoRoot', () => {
  // Finding-2 guard: freeze-machine and CI-runner must produce identical keys.
  const res = runS2(repoRoot, loadGates(cfgDir));
  for (const v of res.violations) {
    // key shape is S2:<graph>:<a|b|c> — split off the canon and check each member.
    const canon = v.key.slice(v.key.indexOf(':', 3) + 1);
    for (const member of canon.split('|')) {
      assert.ok(!member.startsWith('/'),
        `S2 canon member must be graph-relative, got absolute: ${member}`);
      assert.ok(!member.includes(repoRoot),
        `S2 canon member must not embed repoRoot: ${member}`);
    }
  }
});

test('runS2 THROWS (fail closed) when a graph dir is missing instead of reporting 0 cycles', () => {
  // Fail-closed hardening: a graph whose dir does not exist must NOT silently
  // freeze a false zero — a broken/missing graph is a real S2 error, not "clean".
  assert.throws(
    () => runS2(repoRoot, { s2: { graphs: [{ id: 'x', tsconfig: 'no-such-dir/tsconfig.json' }] } }),
    /S2: graph dir missing for no-such-dir\/tsconfig\.json/,
  );
});

test('real-tree S2 counts are unchanged: website=0, e2e=0', () => {
  // Frozen-baseline guard: the hardening must not perturb the live counts.
  // ticket-readiness.ts uses Pool DI (no import of website-db.ts), so no new cycle.
  // T001108: the questionnaire-db.ts → compute-scores.ts cycle was eliminated
  // by moving getDisplayScores to questionnaire-display.ts; S2 dropped 5→4.
  // #2114 (G-CQ07): the tickets-db ↔ website-db cycle was decoupled; S2 dropped 4→0.
  const res = runS2(repoRoot, loadGates(cfgDir));
  const byGraph = {};
  for (const v of res.violations) {
    const id = v.key.split(':')[1];
    byGraph[id] = (byGraph[id] || 0) + 1;
  }
  assert.equal(byGraph.website ?? 0, 0);
  assert.equal(byGraph.e2e ?? 0, 0);
  assert.equal(res.violations.length, 0);
});
