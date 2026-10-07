#!/usr/bin/env node
// openclaw-fake-gateway.mjs <token> <port-file> <request-log>
// Fake-OpenClaw-Gateway für tests/spec/openclaw-ops-bot.bats (T900538). Keine Abhängigkeiten.
// Lauscht auf 127.0.0.1 mit einem freien Port (listen 0) und schreibt den Port atomar in
// <port-file>. POST /v1/chat/completions: prüft `Authorization: Bearer <token>`, hängt pro
// Request eine JSON-Zeile {auth, path, body} an <request-log> an und antwortet mit 200 und
// {"choices":[{"message":{"content":"RESULT: done"}}]} bzw. 401 und Fehler-JSON.
// Alle anderen Pfade: 404.

import { createServer } from 'node:http';
import { appendFileSync, renameSync, writeFileSync } from 'node:fs';

const [token, portFile, logPath] = process.argv.slice(2);
if (!token || !portFile || !logPath) {
  console.error('usage: openclaw-fake-gateway.mjs <token> <port-file> <request-log>');
  process.exit(64);
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    send(res, 404, { error: { message: 'not found', type: 'not_found' } });
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(raw); } catch { body = { unparsable: raw }; }
    const auth = req.headers.authorization === `Bearer ${token}` ? 'ok' : 'bad';
    appendFileSync(logPath, JSON.stringify({ auth, path: req.url, body }) + '\n');
    if (auth !== 'ok') {
      send(res, 401, { error: { message: 'invalid gateway token', type: 'unauthorized' } });
      return;
    }
    send(res, 200, { choices: [{ index: 0, message: { role: 'assistant', content: 'RESULT: done' } }] });
  });
});

server.listen(0, '127.0.0.1', () => {
  const tmp = `${portFile}.tmp`;
  writeFileSync(tmp, String(server.address().port));
  renameSync(tmp, portFile);
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
