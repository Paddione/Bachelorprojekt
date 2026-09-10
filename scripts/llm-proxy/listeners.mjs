// scripts/llm-proxy/listeners.mjs
import http from 'node:http';
import crypto from 'node:crypto';

/**
 * Umschliesst einen HTTP-Handler mit Bearer-Token-Authentifizierung.
 *
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @param {string} token
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void}
 */
export function withBearerAuth(handler, token) {
  const expectedBuf = Buffer.from(token, 'utf8');

  return (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      const body = Buffer.from(JSON.stringify({ error: { code: 'unauthorized' } }));
      res.writeHead(401, { 'content-type': 'application/json', 'content-length': body.length });
      return res.end(body);
    }

    const providedToken = authHeader.slice(7);
    const providedBuf = Buffer.from(providedToken, 'utf8');

    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      const body = Buffer.from(JSON.stringify({ error: { code: 'unauthorized' } }));
      res.writeHead(401, { 'content-type': 'application/json', 'content-length': body.length });
      return res.end(body);
    }

    return handler(req, res);
  };
}

/**
 * Startet den Listener des Proxys.
 *
 * [T900107] Der frueher hier gefuehrte zweite Listener auf der k3d-Docker-Bridge
 * ist entfallen: der Proxy laeuft als Container des dev-pod, und k3d wird nicht
 * mehr verwendet (CLAUDE.md, Cluster-Topologie). Es bleiben genau zwei Faelle.
 *
 * Mit `bindOverride` (LLM_PROXY_HOST_BIND) bindet der Listener auf diesen Host —
 * das ist der Cluster-Pfad: im Pod muss er auf 0.0.0.0 lauschen, sonst ist der
 * Port aus dem Mesh unerreichbar. Ist ein Token gesetzt, haengt die
 * Bearer-Sperre davor.
 *
 * Ohne Override bindet er auf 127.0.0.1 — der Pfad fuer einen lokal gestarteten
 * Proxy, der nur die eigene Maschine bedient.
 *
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @param {number} port
 * @param {{ bindOverride?: string | null, token?: string | null }} [opts={}]
 * @returns {http.Server[]}
 */
export function startListeners(handler, port, opts = {}) {
  const servers = [];
  const token = opts.token || null;
  const host = opts.bindOverride || '127.0.0.1';
  const guarded = opts.bindOverride && token;

  const server = http.createServer(guarded ? withBearerAuth(handler, token) : handler);
  server.listen(port, host, () => {
    console.log(`[llm-proxy] listening on ${host}:${port}${guarded ? ' (bearer-auth protected)' : ''}`);
  });
  servers.push(server);
  return servers;
}
