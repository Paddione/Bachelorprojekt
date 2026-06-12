import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'api-auth-check.mjs');

function makeFixture(mapEndpoints, allowlist = []) {
  const dir = join(tmpdir(), `api-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const mapPath = join(dir, 'api-map.json');
  const allowlistPath = join(dir, 'allowlist.json');
  writeFileSync(mapPath, JSON.stringify({ generatedAt: new Date().toISOString(), endpoints: mapEndpoints }));
  writeFileSync(allowlistPath, JSON.stringify(allowlist));
  return { dir, mapPath, allowlistPath };
}

function runGate(mapPath, allowlistPath, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, API_MAP_PATH: mapPath, ALLOWLIST_PATH: allowlistPath },
  });
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('unclassified endpoint without allowlist → exit 1', () => {
  const { dir, mapPath, allowlistPath } = makeFixture(
    [{ path: '/api/test', methods: ['GET'], auth: 'unclassified', file: 'test.ts' }],
    []
  );
  try {
    const r = runGate(mapPath, allowlistPath);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unclassified/);
  } finally { cleanup(dir); }
});

test('unclassified endpoint with allowlist → exit 0', () => {
  const { dir, mapPath, allowlistPath } = makeFixture(
    [{ path: '/api/test', methods: ['GET'], auth: 'unclassified', file: 'test.ts' }],
    [{ path: '/api/test', methods: ['GET'], reason: 'test' }]
  );
  try {
    const r = runGate(mapPath, allowlistPath);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  } finally { cleanup(dir); }
});

test('admin/session/internal/cron → exit 0 without allowlist', () => {
  const { dir, mapPath, allowlistPath } = makeFixture([
    { path: '/api/a', methods: ['GET'], auth: 'admin', file: 'a.ts' },
    { path: '/api/b', methods: ['GET'], auth: 'session', file: 'b.ts' },
    { path: '/api/c', methods: ['GET'], auth: 'internal', file: 'c.ts' },
    { path: '/api/d', methods: ['GET'], auth: 'cron', file: 'd.ts' },
  ]);
  try {
    const r = runGate(mapPath, allowlistPath);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  } finally { cleanup(dir); }
});

test('unclassified endpoint with allowlist but wrong method → exit 1', () => {
  const { dir, mapPath, allowlistPath } = makeFixture(
    [{ path: '/api/test', methods: ['POST'], auth: 'unclassified', file: 'test.ts' }],
    [{ path: '/api/test', methods: ['GET'], reason: 'wrong method' }]
  );
  try {
    const r = runGate(mapPath, allowlistPath);
    assert.notEqual(r.status, 0);
  } finally { cleanup(dir); }
});

test('regression: session → unclassified without allowlist → exit 1', () => {
  const { dir, mapPath, allowlistPath } = makeFixture(
    [{ path: '/api/test', methods: ['GET'], auth: 'unclassified', file: 'test.ts' }]
  );
  const mainMapPath = join(dir, 'main-map.json');
  writeFileSync(mainMapPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    endpoints: [{ path: '/api/test', methods: ['GET'], auth: 'session', file: 'test.ts' }],
  }));
  try {
    const r = runGate(mapPath, allowlistPath, ['--regression', '--main-map', mainMapPath]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /regression/i);
  } finally { cleanup(dir); }
});

test('regression: session → unclassified with allowlist → exit 0', () => {
  const { dir, mapPath, allowlistPath } = makeFixture(
    [{ path: '/api/test', methods: ['GET'], auth: 'unclassified', file: 'test.ts' }],
    [{ path: '/api/test', methods: ['GET'], reason: 'approved' }]
  );
  const mainMapPath = join(dir, 'main-map.json');
  writeFileSync(mainMapPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    endpoints: [{ path: '/api/test', methods: ['GET'], auth: 'session', file: 'test.ts' }],
  }));
  try {
    const r = runGate(mapPath, allowlistPath, ['--regression', '--main-map', mainMapPath]);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  } finally { cleanup(dir); }
});

test('empty allowlist, all endpoints classified → exit 0', () => {
  const { dir, mapPath, allowlistPath } = makeFixture([
    { path: '/api/a', methods: ['GET'], auth: 'admin', file: 'a.ts' },
    { path: '/api/b', methods: ['POST'], auth: 'session', file: 'b.ts' },
  ]);
  try {
    const r = runGate(mapPath, allowlistPath);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  } finally { cleanup(dir); }
});
