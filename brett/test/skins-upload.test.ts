import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { once } from 'node:events';
import {
  checkSkinAuth,
  validateGlbSize,
  glbHasMixamoBones,
  attachSkinsUpload,
  computeSkinsRoot,
  MAX_SKIN_BYTES,
} from '../src/server/skins-upload';

// Build a minimal GLB (12-byte header + JSON chunk) carrying the given glTF JSON.
function makeGlb(gltf: object): Buffer {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  // pad JSON chunk to 4-byte boundary with spaces
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8); // total length
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}

const RIGGED = makeGlb({ nodes: [{ name: 'mixamorigHips' }, { name: 'mixamorigSpine' }] });
const UNRIGGED = makeGlb({ nodes: [{ name: 'Mesh' }] });

test('checkSkinAuth: true only when header matches BRETT_OIDC_SECRET', () => {
  const env = { BRETT_OIDC_SECRET: 'sek' } as NodeJS.ProcessEnv;
  assert.equal(checkSkinAuth('sek', env), true);
  assert.equal(checkSkinAuth('wrong', env), false);
  assert.equal(checkSkinAuth(undefined, env), false);
  assert.equal(checkSkinAuth('sek', {} as NodeJS.ProcessEnv), false); // no secret configured
});

test('validateGlbSize: rejects > 20 MB', () => {
  assert.equal(validateGlbSize(MAX_SKIN_BYTES), true);
  assert.equal(validateGlbSize(MAX_SKIN_BYTES + 1), false);
  assert.equal(validateGlbSize(1024), true);
});

test('glbHasMixamoBones: true when mixamorigHips node present', () => {
  assert.equal(glbHasMixamoBones(RIGGED), true);
});

test('glbHasMixamoBones: false when mixamorigHips absent', () => {
  assert.equal(glbHasMixamoBones(UNRIGGED), false);
});

test('glbHasMixamoBones: false on malformed/non-GLB buffer', () => {
  assert.equal(glbHasMixamoBones(Buffer.from('not a glb')), false);
});

// ── Route-level tests ───────────────────────────────────────────────────────

async function startApp(): Promise<{ port: number; close: () => void }> {
  const app = express();
  attachSkinsUpload(app);
  const srv = app.listen(0);
  await once(srv, 'listening');
  const addr = srv.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { port, close: () => srv.close() };
}

async function postGlb(
  port: number,
  glb: Buffer,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append('glb', new Blob([glb]), 'skin.glb');
  form.append('name', 'test-skin');
  const res = await fetch(`http://127.0.0.1:${port}/api/skins/upload`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test('POST /api/skins/upload: 200 for valid rigged GLB with correct auth', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status, body } = await postGlb(port, RIGGED, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 200);
    assert.ok(typeof body.id === 'string');
    assert.deepEqual(body.animations, []);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 401 without auth header', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, RIGGED);
    assert.equal(status, 401);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 401 with wrong auth header', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, RIGGED, { 'x-e2e-secret': 'nope' });
    assert.equal(status, 401);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 422 for GLB missing mixamorigHips', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, UNRIGGED, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 422);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 413 for GLB over 20 MB', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    // 20 MB + 1 of valid-GLB-prefixed bytes. Build a big rigged GLB by padding.
    const big = Buffer.concat([RIGGED, Buffer.alloc(MAX_SKIN_BYTES, 0)]);
    const { status } = await postGlb(port, big, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 413);
  } finally {
    close();
  }
});

// ── T000529: SKINS_ROOT must resolve to the served static directory ─────────

test('computeSkinsRoot: returns dist/client/assets/skins when index.html exists (regression T000529)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brett-skins-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html/>');
    const result = computeSkinsRoot(tmpDir);
    assert.equal(result, path.join(tmpDir, 'assets', 'skins'),
      'production: skins must land inside dist/client so express.static serves them');
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('computeSkinsRoot: returns public/assets/skins when no built index.html (dev mode)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brett-skins-'));
  try {
    // No index.html → dev mode
    const result = computeSkinsRoot(tmpDir);
    const expected = path.join(path.dirname(path.dirname(tmpDir)), 'public', 'assets', 'skins');
    assert.equal(result, expected, 'dev: fall back to public/assets/skins');
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
