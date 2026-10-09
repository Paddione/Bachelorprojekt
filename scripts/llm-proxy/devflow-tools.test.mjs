// scripts/llm-proxy/devflow-tools.test.mjs
// T901630 — Routen-Dispatch, Error-Envelope, Backend-Spawning gegen Stub.
//
// Pruefmodus: command output verification — runDevflow/handleDevflow werden
// AUFGERUFEN (ein PATH-Stub fuer `python3` legt JSON-Antworten vor, stdin
// wird in eine Capture-Datei gespiegelt), Status/Body des Ergebnisses werden
// geprueft. Kein Source-Grep. Ephemere Ports via listen(0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { verbForPath, runDevflow, handleDevflow } from './devflow-tools.mjs';

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function baseOf(srv) {
  return `http://127.0.0.1:${srv.address().port}`;
}
function close(srv) {
  return new Promise((r) => srv.close(() => r()));
}

function makeStubDir() {
  const dir = mkdtempSync(join(tmpdir(), 'devflow-stub-'));
  const script = `#!/bin/sh
input=$(cat)
if [ -n "$DEVFLOW_STUB_CAPTURE" ]; then printf '%s' "$input" > "$DEVFLOW_STUB_CAPTURE"; fi
if [ "$DEVFLOW_STUB_MODE" = "sleep" ]; then exec sleep 30; fi
if [ -n "$DEVFLOW_STUB_STDERR" ]; then printf '%s' "$DEVFLOW_STUB_STDERR" >&2; fi
printf '%s' "$DEVFLOW_STUB_STDOUT"
exit "\${DEVFLOW_STUB_EXIT:-0}"
`;
  writeFileSync(join(dir, 'python3'), script, { mode: 0o755 });
  return dir;
}

const STUB_KEYS = ['PATH', 'DEVFLOW_STUB_STDOUT', 'DEVFLOW_STUB_STDERR', 'DEVFLOW_STUB_EXIT', 'DEVFLOW_STUB_MODE', 'DEVFLOW_STUB_CAPTURE'];

function withEnv(t, vars) {
  const saved = new Map(STUB_KEYS.map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const k of STUB_KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function stubPath(t, vars = {}) {
  const dir = makeStubDir();
  // Default-Antwort hier statt im Stub: dash parst ${VAR-{"…"}} falsch.
  withEnv(t, { PATH: `${dir}${delimiter}${process.env.PATH}`, DEVFLOW_STUB_STDOUT: '{"stub":true}', ...vars });
  return dir;
}

// ── Routen-Dispatch (rein) ────────────────────────────────────────────
test('verbForPath: Pfad bestimmt das Verb', () => {
  assert.equal(verbForPath('/tools/devflow/turbolint'), 'turbolint');
  assert.equal(verbForPath('/tools/devflow/insta_ci'), 'insta_ci');
  assert.equal(verbForPath('/tools/devflow/sandbox'), 'sandbox');
  assert.equal(verbForPath('/tools/devflow/nope'), null);
  assert.equal(verbForPath('/v1/chat/completions'), null);
});

// ── Exit-Mapping gegen Stub ───────────────────────────────────────────
test('runDevflow: Exit 0 mit Backend-JSON -> 200 mit demselben Body', async (t) => {
  stubPath(t, { DEVFLOW_STUB_STDOUT: '{"results":[],"summary":{"ok":1}}' });
  const { status, body } = await runDevflow({ verb: 'turbolint', worktree: '.', scope: 'changed' });
  assert.equal(status, 200);
  assert.deepEqual(body, { results: [], summary: { ok: 1 } });
});

test('runDevflow: Exit 0 ohne JSON -> 200 mit ok-Envelope', async (t) => {
  stubPath(t, { DEVFLOW_STUB_STDOUT: '[ruff] SKIPPED: binary not found' });
  const { status, body } = await runDevflow({ verb: 'turbolint' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.match(body.output, /SKIPPED/);
});

test('runDevflow: Exit 1 -> 500 devflow_fail mit stderr-Meldung', async (t) => {
  stubPath(t, {
    DEVFLOW_STUB_EXIT: '1',
    DEVFLOW_STUB_STDERR: '{"error":{"code":"x","message":"lint hard-fail"}}',
    DEVFLOW_STUB_STDOUT: '{"results":[]}',
  });
  const { status, body } = await runDevflow({ verb: 'turbolint' });
  assert.equal(status, 500);
  assert.equal(body.error.code, 'devflow_fail');
  assert.equal(body.error.message, 'lint hard-fail');
  assert.ok(body.error.code.length > 0 && body.error.message.length > 0);
});

test('runDevflow: Exit 2 -> 503 devflow_env', async (t) => {
  stubPath(t, {
    DEVFLOW_STUB_EXIT: '2',
    DEVFLOW_STUB_STDERR: '{"error":{"code":"devflow_env","message":"plan file missing"}}',
  });
  const { status, body } = await runDevflow({ verb: 'turbolint' });
  assert.equal(status, 503);
  assert.equal(body.error.code, 'devflow_env');
  assert.equal(body.error.message, 'plan file missing');
});

test('runDevflow: stdin traegt worktree, scope und extra (Anker: Spawn)', async (t) => {
  const dir = stubPath(t, { DEVFLOW_STUB_STDOUT: '{"ok":true}' });
  const capture = join(dir, 'stdin.json');
  process.env.DEVFLOW_STUB_CAPTURE = capture;
  const { status } = await runDevflow({ verb: 'sandbox', worktree: '/tmp/wt', scope: 'all', extra: { action: 'activate' } });
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(readFileSync(capture, 'utf8')), { worktree: '/tmp/wt', scope: 'all', action: 'activate' });
});

test('runDevflow: Timeout -> 503 devflow_unreachable', async (t) => {
  stubPath(t, { DEVFLOW_STUB_MODE: 'sleep' });
  const started = Date.now();
  const { status, body } = await runDevflow({ verb: 'turbolint', timeoutMs: 200 });
  assert.equal(status, 503);
  assert.equal(body.error.code, 'devflow_unreachable');
  assert.ok(Date.now() - started < 10_000, 'Timeout beendet den Lauf statt zu haengen');
});

test('runDevflow: fehlendes python3 -> 503 devflow_unreachable', async (t) => {
  const empty = mkdtempSync(join(tmpdir(), 'devflow-empty-'));
  withEnv(t, { PATH: empty });
  const { status, body } = await runDevflow({ verb: 'turbolint' });
  assert.equal(status, 503);
  assert.equal(body.error.code, 'devflow_unreachable');
});

// ── handleDevflow mit injizierten Helfern ─────────────────────────────
function fakes(body) {
  const seen = {};
  return {
    seen,
    readBody: async () => body,
    sendJson: (res, status, obj) => { seen.status = status; seen.body = obj; },
  };
}

test('handleDevflow: bekanntes Verb erreicht das Backend (Stub)', async (t) => {
  stubPath(t, { DEVFLOW_STUB_STDOUT: '{"action":"activate","worktree":"/tmp/wt"}' });
  const { seen, readBody, sendJson } = fakes({ worktree: '/tmp/wt', scope: 'changed', action: 'activate' });
  await handleDevflow({}, {}, '/tools/devflow/sandbox', { readBody, sendJson });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.action, 'activate');
});

test('handleDevflow: unbekanntes Verb -> 404 devflow_unknown_verb', async () => {
  const { seen, readBody, sendJson } = fakes({ worktree: '.' });
  await handleDevflow({}, {}, '/tools/devflow/nope', { readBody, sendJson });
  assert.equal(seen.status, 404);
  assert.equal(seen.body.error.code, 'devflow_unknown_verb');
  assert.ok(seen.body.error.message.length > 0);
});

test('handleDevflow: kaputter Body -> 400 mit Envelope', async () => {
  const seen = {};
  await handleDevflow({}, {}, '/tools/devflow/turbolint', {
    readBody: async () => { throw new Error('bad json'); },
    sendJson: (res, status, obj) => { seen.status = status; seen.body = obj; },
  });
  assert.equal(seen.status, 400);
  assert.match(seen.body.error.code, /.+/);
});

test('handleDevflow: Backend-Fail -> Envelope {error:{code,message}}', async (t) => {
  stubPath(t, { DEVFLOW_STUB_EXIT: '1', DEVFLOW_STUB_STDERR: 'boom', DEVFLOW_STUB_STDOUT: 'not json' });
  const { seen, readBody, sendJson } = fakes({ worktree: '.', scope: 'changed' });
  await handleDevflow({}, {}, '/tools/devflow/turbolint', { readBody, sendJson });
  assert.equal(seen.status, 500);
  assert.deepEqual(Object.keys(seen.body), ['error']);
  assert.deepEqual(Object.keys(seen.body.error).sort(), ['code', 'message']);
});

// ── Ende-zu-Ende ueber echtes HTTP ────────────────────────────────────
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': buf.length });
  res.end(buf);
}

test('HTTP: POST /tools/devflow/turbolint erreicht das Backend', async (t) => {
  stubPath(t, { DEVFLOW_STUB_STDOUT: '{"summary":{"ok":3}}' });
  const srv = await listen((req, res) => {
    const path = req.url.split('?')[0];
    if (req.method === 'POST' && path.startsWith('/tools/devflow/')) return handleDevflow(req, res, path, { readBody, sendJson });
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  });
  t.after(() => close(srv));
  const res = await fetch(`${baseOf(srv)}/tools/devflow/turbolint`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worktree: '.', scope: 'changed' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { summary: { ok: 3 } });
});

test('HTTP: unbekanntes Verb -> 404-Envelope', async (t) => {
  stubPath(t, {});
  const srv = await listen((req, res) => {
    const path = req.url.split('?')[0];
    if (req.method === 'POST' && path.startsWith('/tools/devflow/')) return handleDevflow(req, res, path, { readBody, sendJson });
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  });
  t.after(() => close(srv));
  const res = await fetch(`${baseOf(srv)}/tools/devflow/nope`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worktree: '.' }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'devflow_unknown_verb');
});
