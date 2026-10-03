// scripts/toolset/probe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// T900983 D2: ein unerreichbarer Server behaelt seine gemessenen und geprueften Tools;
// nur status/probed_at aendern sich. Ohne diese Regel leerte jeder Lauf ohne Port-Forward
// den Lock und machte die Kuration wertlos.
test('probe.mjs maintains existing lockfile state when servers are unreachable', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-probe-test-'));
  const regDir = path.join(tmpDir, 'docs', 'agent-guide', 'registry');
  fs.mkdirSync(regDir, { recursive: true });
  const lockFile = path.join(regDir, 'toolset.lock.yaml');

  fs.writeFileSync(path.join(regDir, 'mcp.yaml'), `
clients:
  mcp-kubernetes:
    transport: stdio
    command: /nonexistent/bin/mcp-kubernetes
    args: []
`);
  fs.writeFileSync(lockFile, `
lock_version: 2
servers:
  mcp-kubernetes:
    status: ok
    tool_count: 1
    tools:
      pods_list: {hash: aaaaaaaaaaaa}
    reviewed:
      pods_list: aaaaaaaaaaaa
`);

  const probeScript = path.join(process.cwd(), 'scripts', 'toolset', 'probe.mjs');
  execFileSync('node', [probeScript], { cwd: tmpDir, env: process.env });

  const updated = fs.readFileSync(lockFile, 'utf8');
  assert.match(updated, /mcp-kubernetes/);
  assert.match(updated, /pods_list/);
  assert.match(updated, /tool_count: 1/);
  assert.match(updated, /status: unreachable/);
  assert.match(updated, /reviewed:/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
