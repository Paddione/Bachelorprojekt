// scripts/toolset/check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('check.mjs passes for valid registry and consistent targets', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-check-test-'));
  const regFile = path.join(tmpDir, 'capabilities.yaml');
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(regFile, `
capabilities:
  github:
    cli:gh-axi:
      state: canonical
      use_when: "Manage GitHub PRs and issues via CLI"
      roles:
        - all
    mcp:github-mcp:
      state: suppressed
      reason: "Use CLI"
`);

  const settingsFile = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({
    disabledMcpjsonServers: ['github-mcp']
  }));

  const output = execFileSync('node', ['scripts/toolset/check.mjs'], {
    env: {
      ...process.env,
      TOOLSET_REGISTRY: regFile,
      TOOLSET_OUT_DIR: tmpDir,
    }
  }).toString();

  assert.match(output, /check passed/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('check.mjs fails when canonical instance lacks use_when or roles', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-check-test-invalid-'));
  const regFile = path.join(tmpDir, 'capabilities.yaml');
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(regFile, `
capabilities:
  github:
    cli:gh-axi:
      state: canonical
`);

  const settingsFile = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({}));

  assert.throws(() => {
    execFileSync('node', ['scripts/toolset/check.mjs'], {
      env: {
        ...process.env,
        TOOLSET_REGISTRY: regFile,
        TOOLSET_OUT_DIR: tmpDir,
      },
      stdio: 'pipe'
    });
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});


// [T900529] Die minimale Harness-Rolle `pi` ist eine gueltige Rolle. Ohne ihren
// Eintrag in VALID_ROLES wuerde check.mjs jede explizit an `pi` vergebene
// Instanz als "unknown role" ablehnen — die Registry koennte den Harness gar
// nicht versorgen.
test('check.mjs accepts role pi on a canonical instance', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-check-test-pi-'));
  const regFile = path.join(tmpDir, 'capabilities.yaml');
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(regFile, `
capabilities:
  pi-harness:
    skill:pi-only-skill:
      state: canonical
      use_when: "Nur fuer die minimale Harness-Rolle"
      roles:
        - pi
`);

  const settingsFile = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({}));

  const output = execFileSync('node', ['scripts/toolset/check.mjs'], {
    env: {
      ...process.env,
      TOOLSET_REGISTRY: regFile,
      TOOLSET_OUT_DIR: tmpDir,
    }
  }).toString();

  assert.match(output, /check passed/);
  assert.doesNotMatch(output, /unknown role/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
