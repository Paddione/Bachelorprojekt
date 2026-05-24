'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');

// Build a synthetic GLB buffer with a given JSON payload.
function makeGlb(jsonObj) {
  const json = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  // Pad JSON to 4-byte alignment with spaces (GLB spec requirement).
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0);  // 'glTF'
  buf.writeUInt32LE(2, 4);           // version
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16); // 'JSON'
  jsonChunk.copy(buf, 20);
  return buf;
}

const { validateGlb } = require('../server.js');

test('validateGlb: accepts a Mixamo-rigged GLB and extracts animation names', () => {
  const buf = makeGlb({
    nodes: [{ name: 'mixamorigHips' }, { name: 'mixamorigHead' }],
    animations: [{ name: 'idle' }, { name: 'walk' }, { name: 'run' }],
  });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.animations.sort(), ['idle', 'run', 'walk']);
});

test('validateGlb: rejects buffer too small to be a GLB', () => {
  const r = validateGlb(Buffer.alloc(10));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /too small/i);
});

test('validateGlb: rejects bad magic bytes', () => {
  const buf = Buffer.alloc(40);
  buf.writeUInt32LE(0xDEADBEEF, 0);
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /magic|not.*glb/i);
});

test('validateGlb: rejects unsupported GLB version', () => {
  const buf = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  buf.writeUInt32LE(1, 4); // force version 1
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /version/i);
});

test('validateGlb: rejects when mixamorigHips bone is missing', () => {
  const buf = makeGlb({
    nodes: [{ name: 'Hips' }, { name: 'Head' }],
    animations: [],
  });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /mixamorigHips/);
});

test('validateGlb: rejects when JSON chunk has invalid JSON', () => {
  const json = Buffer.from('{not valid json', 'utf8');
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
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /json/i);
});

test('validateGlb: animations field defaults to [] when GLB has none', () => {
  const buf = makeGlb({ nodes: [{ name: 'mixamorigHips' }] });
  const r = validateGlb(buf);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.animations, []);
});
