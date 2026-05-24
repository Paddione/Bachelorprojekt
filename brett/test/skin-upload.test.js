'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const http   = require('http');
const { app, validateGlb } = require('../server.js');

// Reuse the synthetic GLB helper from skin-validator.test.js (inlined here).
function makeGlb(jsonObj) {
  const json = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16);
  jsonChunk.copy(buf, 20);
  return buf;
}

// Build a multipart/form-data POST body. Returns { body: Buffer, boundary }.
function buildMultipart(fields) {
  const boundary = '----brett-test-' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value && Buffer.isBuffer(value.data)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.filename}"\r\n` +
        `Content-Type: ${value.contentType}\r\n\r\n`
      ));
      parts.push(value.data);
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

function postMultipart(routePath, fields, { admin } = {}) {
  const { body, boundary } = buildMultipart(fields);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        host: '127.0.0.1', port, path: routePath, method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': body.length,
          ...(admin ? { 'x-test-admin': '1' } : {}),
        },
      }, res => {
        let out = '';
        res.on('data', c => { out += c; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }); }
          catch { resolve({ status: res.statusCode, body: out }); }
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      req.write(body);
      req.end();
    });
  });
}

test('POST /api/skins/upload: rejects without admin session', async () => {
  const glb = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Test',
    glb: { data: glb, filename: 'test.glb', contentType: 'model/gltf-binary' },
  });
  assert.strictEqual(r.status, 403);
});

test('POST /api/skins/upload: accepts a valid Mixamo GLB from admin', async () => {
  // We use the test-mode admin shortcut (added in Step 3 below).
  const glb = makeGlb({
    nodes: [{ name: 'mixamorigHips' }],
    animations: [{ name: 'idle' }],
  });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Test Skin',
    glb: { data: glb, filename: 'test.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.id, 'test-skin');
  assert.deepStrictEqual(r.body.animations, ['idle']);

  // Cleanup so the test is repeatable.
  const created = path.join(__dirname, '..', 'public', 'assets', 'skins', 'test-skin');
  fs.rmSync(created, { recursive: true, force: true });
});

test('POST /api/skins/upload: rejects non-Mixamo GLB with 400', async () => {
  const glb = makeGlb({ nodes: [{ name: 'Hips' }] });
  const r = await postMultipart('/api/skins/upload', {
    name: 'Bad Rig',
    glb: { data: glb, filename: 'bad.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /mixamorigHips/);
});

test('POST /api/skins/upload: rejects missing name field', async () => {
  const glb = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = await postMultipart('/api/skins/upload', {
    glb: { data: glb, filename: 'x.glb', contentType: 'model/gltf-binary' },
  }, { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /name/);
});

function del(routePath, { admin } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        host: '127.0.0.1', port, path: routePath, method: 'DELETE',
        headers: admin ? { 'x-test-admin': '1' } : {},
      }, res => {
        let out = '';
        res.on('data', c => { out += c; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      req.end();
    });
  });
}

test('DELETE /api/skins/:id: rejects without admin', async () => {
  const r = await del('/api/skins/anything');
  assert.strictEqual(r.status, 403);
});

test('DELETE /api/skins/default: returns 400', async () => {
  const r = await del('/api/skins/default', { admin: true });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /default/);
});

test('DELETE /api/skins/:id: removes existing skin directory', async () => {
  const skinDir = path.join(__dirname, '..', 'public', 'assets', 'skins', 'to-delete');
  fs.mkdirSync(skinDir, { recursive: true });
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({ id: 'to-delete', name: 'X' }));
  const r = await del('/api/skins/to-delete', { admin: true });
  assert.strictEqual(r.status, 204);
  assert.strictEqual(fs.existsSync(skinDir), false);
});

test('DELETE /api/skins/:id: returns 404 if skin does not exist', async () => {
  const r = await del('/api/skins/does-not-exist', { admin: true });
  assert.strictEqual(r.status, 404);
});

test('DELETE /api/skins/:id: rejects path-traversal id', async () => {
  const r = await del('/api/skins/..%2F..%2Fetc', { admin: true });
  assert.ok(r.status === 400 || r.status === 404);
});
