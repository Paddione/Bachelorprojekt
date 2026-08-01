#!/usr/bin/env node
// scripts/mcp-cors-proxy/proxy.mjs
//
// Transparenter CORS-Reverse-Proxy fuer MCP-Server, die selbst kein CORS
// koennen (z.B. das OTS-Image kubernetes_mcp_server). Der Browser
// (llama-Web-UI auf http://localhost:8098) blockiert sonst jeden
// cross-origin-Aufruf ("Failed to fetch").
//
// Der Proxy lauscht auf 127.0.0.1:<LISTEN_PORT>, beantwortet OPTIONS
// (Preflight) selbst und reicht alle uebrigen Methoden transparent an
// <UPSTREAM> weiter — Pfade, Body und SSE-Streams bleiben unveraendert,
// nur die CORS-Header kommen dazu. Bestehende Clients des Upstreams sind
// nicht betroffen, weil der Proxy eine eigene Portadresse hat.
//
// Origin/Referer und Browser-Fetch-Metadata (sec-fetch-*, sec-ch-*) werden vor
// dem Weiterreichen entfernt: Das OTS-Image kubernetes_mcp_server wirft sonst
// 403 auf jede Cross-Origin-Anfrage (eigener CSRF-Schutz prueft Origin- und
// Sec-Fetch-Site-Header). Der Browser bekommt die CORS-Header trotzdem,
// weil sie erst am Antwortweg gesetzt werden.
//
// Start:
//   LISTEN_PORT=18082 UPSTREAM=http://127.0.0.1:18080 node scripts/mcp-cors-proxy/proxy.mjs

import http from 'node:http';

const HOST = process.env.LISTEN_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.LISTEN_PORT ?? '18082', 10);
const UPSTREAM = new URL(process.env.UPSTREAM ?? 'http://127.0.0.1:18080');

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function corsFor(req) {
  const requested = req.headers['access-control-request-headers'];
  return requested
    ? { ...CORS_HEADERS, 'access-control-allow-headers': requested }
    : CORS_HEADERS;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsFor(req));
    res.end();
    return;
  }

  const forwardHeaders = { ...req.headers, host: UPSTREAM.host };
  for (const name of Object.keys(forwardHeaders)) {
    if (name.startsWith('origin') || name.startsWith('referer') ||
        name.startsWith('sec-fetch-') || name.startsWith('sec-ch-')) {
      delete forwardHeaders[name];
    }
  }

  const upstreamReq = http.request({
    protocol: UPSTREAM.protocol,
    hostname: UPSTREAM.hostname,
    port: UPSTREAM.port,
    path: req.url,
    method: req.method,
    headers: forwardHeaders,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, {
      ...CORS_HEADERS,
      ...upstreamRes.headers,
    });
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    res.writeHead(502, { ...CORS_HEADERS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'upstream_error', message: err.message } }));
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, HOST, () => {
  console.error(`mcp-cors-proxy listening on http://${HOST}:${PORT} -> ${UPSTREAM.href}`);
});
