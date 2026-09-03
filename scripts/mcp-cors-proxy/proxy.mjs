#!/usr/bin/env node
// scripts/mcp-cors-proxy/proxy.mjs
//
// Guarded CORS-Reverse-Proxy fuer MCP-Server, die selbst kein CORS
// koennen (z.B. das OTS-Image kubernetes_mcp_server). Der Browser
// (llama-Web-UI auf http://localhost:8098) blockiert sonst jeden
// cross-origin-Aufruf ("Failed to fetch").
//
// Nutzt die gemeinsame Sicherheitsgrenze (mcp-http-security.mjs) fuer
// Host-/Origin-/Token-Validierung. [T900052]
//
// Der Proxy lauscht auf 127.0.0.1:<LISTEN_PORT>, beantwortet OPTIONS
// (Preflight) selbst und reicht alle uebrigen Methoden transparent an
// <UPSTREAM> weiter — Pfade, Body und SSE-Streams bleiben unveraendert,
// nur die CORS-Header kommen dazu. Bestehende Clients des Upstreams sind
// nicht betroffen, weil der Proxy eine eigene Portadresse hat.
//
// Origin/Referer und Browser-Fetch-Metadata werden NICHT weitergeleitet:
// Nur ein fester Header-Allowlist wird zum Upstream gesendet.
// Der Browser bekommt die CORS-Header am Antwortweg ueber corsHeadersFor().
//
// Start:
//   MCP_KUBERNETES_TOKEN=... LISTEN_PORT=18082 UPSTREAM=http://127.0.0.1:18080 \
//     node scripts/mcp-cors-proxy/proxy.mjs

import http from 'node:http';

const { requireToken, guardRequest, corsHeadersFor, writeSecurityError, allowedBrowserOrigins } =
  await import(new URL('../lib/mcp-http-security.mjs', import.meta.url));

const HOST = process.env.LISTEN_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.LISTEN_PORT ?? '18082', 10);
const UPSTREAM = new URL(process.env.UPSTREAM ?? 'http://127.0.0.1:18080');
const TOKEN = requireToken('MCP_KUBERNETES_TOKEN');
const ALLOWED_ORIGINS = allowedBrowserOrigins();

// Fixed allowlist of headers to forward to the upstream.
// Everything else is stripped — no prefix-based deletion, no wildcard passthrough.
// Browser-sensitive headers (Origin, Referer, sec-fetch-*, sec-ch-*) are never forwarded.
const FORWARD_HEADERS = new Set([
  'content-type',
  'accept',
  'mcp-protocol-version',
]);

const server = http.createServer((req, res) => {
  // Minimal liveness probe — no auth required
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  // OPTIONS preflight: Host/Origin check, no auth
  if (req.method === 'OPTIONS') {
    const g = guardRequest(req, { token: TOKEN, allowedOrigins: ALLOWED_ORIGINS, requireAuth: false });
    if (!g.ok) {
      writeSecurityError(res, g.status, g.message);
      return;
    }
    res.writeHead(204, corsHeadersFor(req.headers.origin, ALLOWED_ORIGINS));
    res.end();
    return;
  }

  // All other methods: full security boundary (Host + Origin + Token)
  const g = guardRequest(req, { token: TOKEN, allowedOrigins: ALLOWED_ORIGINS });
  if (!g.ok) {
    writeSecurityError(res, g.status, g.message);
    return;
  }

  // Forward with fixed header allowlist — only explicitly listed headers pass through
  const forwardHeaders = { host: UPSTREAM.host };
  for (const name of Object.keys(req.headers)) {
    if (FORWARD_HEADERS.has(name)) {
      forwardHeaders[name] = req.headers[name];
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
      ...corsHeadersFor(g.allowedOrigin, ALLOWED_ORIGINS),
      ...upstreamRes.headers,
    });
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    const cors = corsHeadersFor(g.allowedOrigin, ALLOWED_ORIGINS);
    res.writeHead(502, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'upstream_error', message: err.message } }));
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, HOST, () => {
  console.error(`mcp-cors-proxy listening on http://${HOST}:${PORT} -> ${UPSTREAM.href}`);
});
