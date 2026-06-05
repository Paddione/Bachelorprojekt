import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './emit-index.mjs';
import { loadSubsystems, loadGates } from './load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('buildIndex does not throw over real HEAD (C4: full coverage)', () => {
  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  assert.doesNotThrow(() => buildIndex(repoRoot, subs, gates));
});

test('buildIndex is byte-deterministic and has no timestamp', () => {
  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  const a = JSON.stringify(buildIndex(repoRoot, subs, gates));
  const b = JSON.stringify(buildIndex(repoRoot, subs, gates));
  assert.equal(a, b);
  assert.ok(!/generated_at/.test(a), 'index must not contain generated_at');
  // No wall-clock generation timestamp anywhere in the index METADATA. We scope
  // the ISO-timestamp guard to the non-`files` portion because some tracked
  // files (e.g. environments/*/scraps/sketch-2026-04-29T03-16-36-*.napkin)
  // legitimately embed an ISO timestamp in their filename — those are data, not
  // a generation timestamp. A buggy generator would inject a wall-clock stamp as
  // a top-level or per-subsystem metadata field, never inside a files[] path.
  const idx = buildIndex(repoRoot, subs, gates);
  const metadata = JSON.stringify({
    generated_by: idx.generated_by,
    subsystems: idx.subsystems.map((s) => ({
      id: s.id, name: s.name, owner_agent: s.owner_agent, file_count: s.file_count,
    })),
  });
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(metadata),
    'index metadata must not contain an ISO timestamp');
});

test('buildIndex throws on an orphan file (no owning subsystem)', () => {
  // a registry with a hole: only owns website/**, but scan-universe has more.
  const holed = [{
    id: 'only-web', name: 'x', paths: ['website/**'],
    owner_agent: 'bachelorprojekt-website', test_location: 'website/', purpose: 'x',
  }];
  const gates = loadGates(cfgDir);
  assert.throws(() => buildIndex(repoRoot, holed, gates), /orphan/i);
});
