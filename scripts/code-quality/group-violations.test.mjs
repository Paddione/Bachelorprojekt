// scripts/code-quality/group-violations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupViolations } from './group-violations.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..');

// Minimal inline subsystems for unit tests (mirrors subsystems.yaml structure)
const subsystems = [
  { id: 'tests', paths: ['tests/**', 'website/test/**', 'website/tests/**'] },
  { id: 'website', paths: ['website/**'] },
  { id: 'scripts-infra', paths: ['scripts/**'] },
  { id: 'infra-manifests', paths: ['k3d/**', 'prod/**', 'prod-fleet/**', 'prod-mentolder/**', 'prod-korczewski/**'] },
  { id: 'brett', paths: ['brett/**'] },
];

const sampleBaseline = {
  'S1:website/src/pages/big.astro': { gate: 'S1', path: 'website/src/pages/big.astro', metric: 612, detail: 'x', frozen_at: 'abc' },
  'S1:website/src/components/Hero.svelte': { gate: 'S1', path: 'website/src/components/Hero.svelte', metric: 550, detail: 'y', frozen_at: 'abc' },
  'S1:scripts/build.sh': { gate: 'S1', path: 'scripts/build.sh', metric: 520, detail: 'z', frozen_at: 'abc' },
  'S3:k3d/configmap.yaml:foo.mentolder.de': { gate: 'S3', path: 'k3d/configmap.yaml', metric: 1, detail: 'w', frozen_at: 'abc' },
  'S1:brett/public/scene.js': { gate: 'S1', path: 'brett/public/scene.js', metric: 700, detail: 'v', frozen_at: 'abc' },
};

test('groups violations by (gate \xd7 subsystem)', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const titles = groups.map((g) => g.title).sort();
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:website')), 'S1:website group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:scripts-infra')), 'S1:scripts-infra group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S3:infra-manifests')), 'S3:infra-manifests group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:brett')), 'S1:brett group expected');
});

test('title format is CQ-GATE:<gate>:<subsystem> — N Dateien k\xfcrzen (S1) or N Fundstellen beheben', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const s1Website = groups.find((g) => g.gate === 'S1' && g.subsystem === 'website');
  assert.ok(s1Website, 'S1:website group must exist');
  assert.equal(s1Website.count, 2);
  assert.match(s1Website.title, /^CQ-GATE:S1:website — 2 /);
});

test('violation_keys array contains the matching keys', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const s1Website = groups.find((g) => g.gate === 'S1' && g.subsystem === 'website');
  assert.deepEqual(
    s1Website.violation_keys.sort(),
    ['S1:website/src/components/Hero.svelte', 'S1:website/src/pages/big.astro'],
  );
});

test('paths with no matching subsystem go into "unknown"', () => {
  const baselineWithOrphan = {
    ...sampleBaseline,
    'S4:some-unknown-dir/foo.yaml': { gate: 'S4', path: 'some-unknown-dir/foo.yaml', metric: 1, detail: 'x', frozen_at: 'abc' },
  };
  const groups = groupViolations(baselineWithOrphan, subsystems);
  const unknownGroup = groups.find((g) => g.subsystem === 'unknown');
  assert.ok(unknownGroup, '"unknown" group should be created for unmatched paths');
  assert.ok(unknownGroup.violation_keys.includes('S4:some-unknown-dir/foo.yaml'));
});

test('returns empty array for empty baseline', () => {
  const groups = groupViolations({}, subsystems);
  assert.deepEqual(groups, []);
});

test('group over real repo HEAD does not throw (smoke test)', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadSubsystems } = await import('./load.mjs');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const realBaseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8'));
  const realSubs = loadSubsystems(cfgDir);
  // Must not throw
  const groups = groupViolations(realBaseline, realSubs);
  assert.ok(Array.isArray(groups));
  assert.ok(groups.length > 0, 'real baseline should produce at least one group');
});
