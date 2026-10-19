import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('runS4 liest materialisierte Skill-Links (untracked, ignoriert) in den Corpus', () => {
  // Fixture: Skill-Verzeichnis als Symlink (wie link-from-repo.py), per
  // .gitignore aus git ls-files ausgeschlossen — Referenzen darin muessen
  // trotzdem zaehlen, sonst meldet S4 lebende Skripte als Waisen.
  const dir = mkdtempSync(join(tmpdir(), 's4-links-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 's4@example.invalid');
  git('config', 'user.name', 'S4 Test');
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'used.sh'), '#!/bin/sh\n');
  writeFileSync(join(dir, 'scripts', 'orphan.sh'), '#!/bin/sh\n');
  writeFileSync(join(dir, '.gitignore'), '.opencode/skills/*\n');
  mkdirSync(join(dir, 'outside', 'demo'), { recursive: true });
  writeFileSync(join(dir, 'outside', 'demo', 'SKILL.md'), 'run `bash scripts/used.sh`\n');
  mkdirSync(join(dir, '.opencode', 'skills'), { recursive: true });
  symlinkSync(join(dir, 'outside', 'demo'), join(dir, '.opencode', 'skills', 'demo'));
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const gates = {
    s4: {
      manifest_globs: [],
      script_globs: ['scripts/*.sh'],
      command_globs: [],
      allowlist_globs: [],
      reference_sources: ['.opencode/skills/**/*.md'],
    },
  };
  const res = runS4(dir, gates);
  assert.deepEqual(res.violations.map((v) => v.key), ['S4:scripts/orphan.sh']);
});
