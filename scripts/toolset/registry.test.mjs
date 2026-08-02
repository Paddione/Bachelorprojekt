// scripts/toolset/registry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { loadRegistry, parseInstanceKey } from './lib/registry.mjs';

test('parseInstanceKey validates known prefixes', () => {
  assert.deepEqual(parseInstanceKey('cli:gh-axi'), { prefix: 'cli:', name: 'gh-axi' });
  assert.deepEqual(parseInstanceKey('mcp:github-mcp'), { prefix: 'mcp:', name: 'github-mcp' });
  assert.throws(() => parseInstanceKey('invalid:foo'), /Invalid instance key prefix/);
  assert.throws(() => parseInstanceKey('noprefix'), /must contain a known prefix/);
});

test('loadRegistry validates canonical and suppressed states and reasons', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-test-'));
  const regFile = path.join(tmpDir, 'capabilities.yaml');

  // Valid
  fs.writeFileSync(regFile, `
capabilities:
  github:
    cli:gh-axi:
      state: canonical
    mcp:github-mcp:
      state: suppressed
      reason: "Use CLI"
`);

  const loaded = loadRegistry(regFile);
  assert.equal(loaded.capabilities.github['cli:gh-axi'].state, 'canonical');
  assert.equal(loaded.capabilities.github['mcp:github-mcp'].state, 'suppressed');

  // Invalid state without reason
  fs.writeFileSync(regFile, `
capabilities:
  github:
    cli:gh-axi:
      state: canonical
    mcp:github-mcp:
      state: suppressed
`);
  assert.throws(() => loadRegistry(regFile), /missing a 'reason'/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
