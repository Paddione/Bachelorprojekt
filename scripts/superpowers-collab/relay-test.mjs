import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

// locate the companion server.cjs in the plugin cache
function findServer() {
  const root = join(process.env.HOME, '.claude/plugins/cache');
  if (!existsSync(root)) return null;
  const hits = [];
  (function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!p.includes('node_modules')) walk(p); }
      else if (e.name === 'server.cjs' && p.includes('brainstorming')) hits.push(p);
    }
  })(root);
  return hits.sort().pop() ?? null;
}

// minimal RFC6455 client frame (masked) + unmask of server frames — see server.cjs
function clientFrame(str) {
  const payload = Buffer.from(str); const mask = crypto.randomBytes(4);
  const len = payload.length; let header;
  if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  const masked = Buffer.alloc(len); for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}
function decodeServer(buf) { // unmasked text frames from server
  const len = buf[1] & 0x7f; const data = buf.slice(2, 2 + len); return data.toString();
}
function wsConnect(port) {
  return new Promise((res, rej) => {
    const s = net.connect(port, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    let upgraded = false;
    s.on('data', (d) => { if (!upgraded && d.toString().includes('101')) { upgraded = true; res(s); } });
    s.on('error', rej);
  });
}

test('patched server relays chat A→B and appends note to events', async (t) => {
  const SRC = findServer();
  if (!SRC) {
    t.skip('companion server.cjs not found in plugin cache — skipping relay test');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'bs-relay-'));
  // apply the relay patch to a copy (Task 3 ships the real patcher; here we inline the same transform)
  const patched = join(dir, 'server.cjs');
  let src = readFileSync(SRC, 'utf8');
  src = src.replace(
    /if \(event\.choice\) \{[\s\S]*?\n  \}/,
    `if (event.type === 'chat' || event.type === 'presence' || event.type === 'note') { broadcast(event); }
  if (event.choice || event.type === 'note' || event.type === 'chat') {
    const eventsFile = path.join(STATE_DIR, 'events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\\n');
  }`);
  writeFileSync(patched, src);
  // companion reads frame-template.html + helper.js from __dirname — copy them next to the patched file
  for (const f of ['frame-template.html', 'helper.js']) {
    const src_f = join(dirname(SRC), f);
    if (existsSync(src_f)) copyFileSync(src_f, join(dir, f));
  }

  const PORT = 53110;
  const env = { ...process.env, BRAINSTORM_PORT: String(PORT), BRAINSTORM_DIR: join(dir, 'sess') };
  const proc = spawn('node', [patched], { env });
  await new Promise(r => setTimeout(r, 800));
  try {
    const a = await wsConnect(PORT); const b = await wsConnect(PORT);
    const got = new Promise((res) => b.on('data', (d) => { const t = decodeServer(d); if (t.includes('hallo')) res(t); }));
    a.write(clientFrame(JSON.stringify({ type: 'chat', who: 'A', text: 'hallo' })));
    const relayed = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no relay')), 3000))]);
    assert.match(relayed, /hallo/);
    a.write(clientFrame(JSON.stringify({ type: 'note', who: 'A', text: 'persist-me' })));
    await new Promise(r => setTimeout(r, 300));
    const ev = join(dir, 'sess', 'state', 'events');
    assert.ok(existsSync(ev) && readFileSync(ev, 'utf8').includes('persist-me'), 'note appended to events');
    a.destroy(); b.destroy();
  } finally { proc.kill(); }
});
