// scripts/toolset/probe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('probe.mjs maintains existing lockfile state when servers are unreachable', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-probe-test-'));
  const lockFile = path.join(tmpDir, 'docs', 'agent-guide', 'registry', 'toolset.lock.yaml');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  fs.writeFileSync(lockFile, `
lock_version: 1
servers:
  mcp-kubernetes:
    tool_count: 5
    status: active
`);

  const probeScript = path.join(process.cwd(), 'scripts', 'toolset', 'probe.mjs');
  execFileSync('node', [probeScript], {
    cwd: tmpDir,
    env: process.env
  });

  const updated = fs.readFileSync(lockFile, 'utf8');
  assert.match(updated, /mcp-kubernetes/);
  assert.match(updated, /tool_count: 5/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
