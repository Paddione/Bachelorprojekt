// scripts/llm-proxy/listeners.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * Ermittelt das Gateway des k3d-Docker-Netzes.
 * Gibt bei Fehlern null zurueck statt zu werfen.
 *
 * @param {string} networkName
 * @param {typeof execFileSync} [exec=execFileSync]
 * @returns {string | null}
 */
export function discoverBridgeAddress(networkName, exec = execFileSync) {
  try {
    const out = exec('docker', [
      'network',
      'inspect',
      networkName,
      '-f',
      '{{range .IPAM.Config}}{{.Gateway}}{{end}}',
    ]);
    const ip = String(out).trim();
    return ip.length > 0 ? ip : null;
  } catch {
    return null;
  }
}

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
 * Startet Listener auf Loopback und optional auf der k3d-Bridge-IP.
 *
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @param {number} port
 * @param {{ bindOverride?: string | null, token?: string | null, network?: string }} [opts={}]
 * @returns {http.Server[]}
 */
export function startListeners(handler, port, opts = {}) {
  const servers = [];

  // Loopback-Listener
  const loopbackServer = http.createServer(handler);
  loopbackServer.listen(port, '127.0.0.1', () => {
    console.log(`[llm-proxy] listening on 127.0.0.1:${port}`);
  });
  servers.push(loopbackServer);

  // Bridge-Listener ermitteln
  const network = opts.network || 'k3d-mentolder-dev';
  const bridgeIp = opts.bindOverride || discoverBridgeAddress(network);
  const token = opts.token || null;

  if (bridgeIp && token) {
    const bridgeServer = http.createServer(withBearerAuth(handler, token));
    bridgeServer.listen(port, bridgeIp, () => {
      console.log(`[llm-proxy] listening on ${bridgeIp}:${port} (bearer-auth protected)`);
    });
    servers.push(bridgeServer);
  } else if (!bridgeIp) {
    console.log(`[llm-proxy] bridge listener skipped: docker network '${network}' gateway not discovered`);
  } else if (!token) {
    console.log(`[llm-proxy] bridge listener on ${bridgeIp}:${port} skipped: LLM_PROXY_ADMIN_TOKEN not set`);
  }

  return servers;
}
