#!/usr/bin/env node
// tests/spec/mcp-gateway/http-security-boundary-server.mjs
// [T900052] Minimaler echter HTTP-Listener, der die gemeinsame Sicherheitsgrenze
// (scripts/lib/mcp-http-security.mjs) bindet, damit die BATS-Tests die Policy
// ueber ein reales Socket pruefen (Design D7). Kein Produktionscode.
//
// Konfiguration ueber Env:
//   BND_MODULE    abs. Pfad zu scripts/lib/mcp-http-security.mjs
//   BND_TOKEN     erwartetes Bearer-Token
//   BND_ORIGINS   JSON-Array zugelassener Browser-Origins (optional)
//   BND_PORT      Port (127.0.0.1)
//
// Routen:
//   GET  /hits  -> Anzahl erreichter Dispatcher-Aufrufe (Darstellung des
//                  Negativ-Ankers: abgelehnte Requests muessen 0 lassen).
//   alle anderen -> fail-closed Grenze; nur zugelassene Requests zaehlen.

import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const { guardRequest, corsHeadersFor, writeSecurityError } = await import(
  pathToFileURL(process.env.BND_MODULE).href
);

const token = process.env.BND_TOKEN;
const allowed = new Set(
  process.env.BND_ORIGINS ? JSON.parse(process.env.BND_ORIGINS) : [],
);
const port = Number(process.env.BND_PORT);
let hits = 0;

const server = createServer((req, res) => {
  if (req.url === '/hits') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(String(hits));
    return;
  }

  if (req.method === 'OPTIONS') {
    const g = guardRequest(req, { token, allowedOrigins: allowed, requireAuth: false });
    if (!g.ok) {
      writeSecurityError(res, g.status, g.message);
      return;
    }
    res.writeHead(204, corsHeadersFor(req.headers.origin, allowed));
    res.end();
    return;
  }

  const g = guardRequest(req, { token, allowedOrigins: allowed });
  if (!g.ok) {
    writeSecurityError(res, g.status, g.message);
    return;
  }
  hits++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ dispatched: true }));
});

server.listen(port, '127.0.0.1');
