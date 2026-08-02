// scripts/toolset/sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('sync.mjs surgically updates disabledMcpjsonServers in settings.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-sync-test-'));
  const regFile = path.join(tmpDir, 'capabilities.yaml');
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(regFile, `
capabilities:
  github:
    cli:gh-axi:
      state: canonical
    mcp:github-mcp:
      state: suppressed
      reason: "Use CLI"
`);

  const settingsFile = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({
    theme: 'dark',
    disabledMcpjsonServers: []
  }, null, 2));

  execFileSync('node', ['scripts/toolset/sync.mjs'], {
    env: {
      ...process.env,
      TOOLSET_REGISTRY: regFile,
      TOOLSET_OUT_DIR: tmpDir,
    }
  });

  const updated = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(updated.theme, 'dark');
  assert.deepEqual(updated.disabledMcpjsonServers, ['github-mcp']);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
