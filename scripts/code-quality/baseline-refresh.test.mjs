// scripts/code-quality/baseline-refresh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRefresh } from './baseline-refresh.mjs';

// Fixture baseline: two violations
const baseline = {
  'S1:website/src/pages/big.astro': {
    gate: 'S1', path: 'website/src/pages/big.astro', metric: 612,
    detail: '612 lines > 400', frozen_at: 'abc123',
  },
  'S3:k3d/foo.yaml:files.mentolder.de': {
    gate: 'S3', path: 'k3d/foo.yaml', metric: 1,
    detail: 'hardcoded hostname', frozen_at: 'abc123',
  },
  'S1:scripts/deploy.sh': {
    gate: 'S1', path: 'scripts/deploy.sh', metric: 520,
    detail: '520 lines > 500 limit (.sh)', frozen_at: 'abc123',
  },
};

test('removes FIXED entries (key absent from current violations)', () => {
  // S3 violation has been fixed; S1 violations still present
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 612, detail: '612 lines > 400' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated, removed, unchanged } = applyRefresh(baseline, current);
  assert.ok(!('S3:k3d/foo.yaml:files.mentolder.de' in updated), 'FIXED key should be removed');
  assert.equal(removed, 1);
  assert.equal(unchanged, 2);
});

test('updates lowered metric values (metric improved but violation still present)', () => {
  // big.astro was trimmed from 612 to 450 lines — still over limit but improved
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 450, detail: '450 lines > 400' },
    { key: 'S3:k3d/foo.yaml:files.mentolder.de', path: 'k3d/foo.yaml', metric: 1, detail: 'hardcoded hostname' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated } = applyRefresh(baseline, current);
  assert.equal(updated['S1:website/src/pages/big.astro'].metric, 450);
  assert.equal(updated['S1:website/src/pages/big.astro'].detail, '450 lines > 400');
});

test('preserves unresolved violations at same metric', () => {
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 612, detail: '612 lines > 400' },
    { key: 'S3:k3d/foo.yaml:files.mentolder.de', path: 'k3d/foo.yaml', metric: 1, detail: 'hardcoded hostname' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated, removed, unchanged } = applyRefresh(baseline, current);
  assert.equal(removed, 0);
  assert.equal(unchanged, 3);
  assert.equal(Object.keys(updated).length, 3);
});

test('returns summary counts: removed + updated + unchanged', () => {
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 450, detail: '450 lines > 400' },
    // S3 fixed, S1:scripts unchanged
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const result = applyRefresh(baseline, current);
  assert.equal(result.removed, 1);   // S3 gone
  assert.equal(result.updated_count, 1);   // big.astro metric lowered
  assert.equal(result.unchanged, 1); // deploy.sh unchanged
});

test('handles empty baseline', () => {
  const result = applyRefresh({}, []);
  assert.deepEqual(result.updated, {});
  assert.equal(result.removed, 0);
  assert.equal(result.updated_count, 0);
});
