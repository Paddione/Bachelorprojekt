'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { listSkins, slugifyForSkin } = require('../server.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brett-skins-'));
}

test('listSkins: empty dir returns just the default entry', () => {
  const dir = mkTmp();
  const out = listSkins(dir);
  assert.deepStrictEqual(out, [{ id: 'default', name: 'Mannequin', thumb: null, animations: [] }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: includes valid meta.json entries with thumb path', () => {
  const dir = mkTmp();
  const skinDir = path.join(dir, 'patrick-001');
  fs.mkdirSync(skinDir);
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({
    id: 'patrick-001', name: 'Patrick', author: 'pk', animations: ['idle', 'walk', 'run'],
  }));
  fs.writeFileSync(path.join(skinDir, 'thumb.png'), '');
  const out = listSkins(dir);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0].id, 'default');
  assert.deepStrictEqual(out[1], {
    id: 'patrick-001',
    name: 'Patrick',
    thumb: '/assets/skins/patrick-001/thumb.png',
    animations: ['idle', 'walk', 'run'],
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: skin without thumb has thumb=null', () => {
  const dir = mkTmp();
  const skinDir = path.join(dir, 'no-thumb');
  fs.mkdirSync(skinDir);
  fs.writeFileSync(path.join(skinDir, 'meta.json'), JSON.stringify({
    id: 'no-thumb', name: 'No Thumb', animations: [],
  }));
  const out = listSkins(dir);
  const found = out.find(s => s.id === 'no-thumb');
  assert.ok(found);
  assert.strictEqual(found.thumb, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: silently skips subdirs with broken meta.json', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'broken'));
  fs.writeFileSync(path.join(dir, 'broken', 'meta.json'), '{ this is not json');
  fs.mkdirSync(path.join(dir, 'no-meta')); // missing meta.json entirely
  const out = listSkins(dir);
  assert.deepStrictEqual(out.map(s => s.id), ['default']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listSkins: ignores the "default" subdir to avoid double-listing', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'default'));
  const out = listSkins(dir);
  assert.deepStrictEqual(out.map(s => s.id), ['default']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('slugifyForSkin: ascii name → kebab-case', () => {
  assert.strictEqual(slugifyForSkin('Patrick Korczewski'), 'patrick-korczewski');
});

test('slugifyForSkin: strips diacritics and punctuation', () => {
  assert.strictEqual(slugifyForSkin('Über-Möbel!!'), 'ber-mbel');
});

test('slugifyForSkin: caps length at 32 chars', () => {
  const long = 'a'.repeat(100);
  assert.ok(slugifyForSkin(long).length <= 32);
});

test('slugifyForSkin: empty / pure-symbol input gets a random fallback id', () => {
  const out = slugifyForSkin('!!!');
  assert.match(out, /^skin-[0-9a-f]{6}$/);
});

const { app } = require('../server.js');

// Minimal in-process HTTP request helper — avoids pulling in supertest.
function getJson(routePath) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const http = require('http');
      http.get({ host: '127.0.0.1', port, path: routePath }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch (err) { reject(err); }
        });
      }).on('error', err => { server.close(); reject(err); });
    });
  });
}

test('GET /api/skins: returns at least the default entry', async () => {
  const r = await getJson('/api/skins');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.some(s => s.id === 'default'));
});
