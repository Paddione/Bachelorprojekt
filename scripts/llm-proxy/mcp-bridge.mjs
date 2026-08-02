// scripts/llm-proxy/mcp-bridge.mjs
// stdio→HTTP/SSE bridge for MCP servers.
// Each enabled server gets one child process shared across all HTTP sessions.
// GET  /mcp/<name> → SSE stream (event: session_id, followed by event: message)
// POST /mcp/<name> → writes JSON-RPC to child stdin; the child's response is
//   returned directly (200) on the same POST — streamable_http compatible —
//   and additionally broadcast to open SSE sessions for legacy SSE clients.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Internal state ────────────────────────────────────────────────────────────

/** @type {Map<string, ServerEntry>} */
const servers = new Map();

/** @type {Map<string, {res: import('node:http').ServerResponse, timer: NodeJS.Timeout}>} */
const pending = new Map();

/** @type {object|null} */
let config = null;

/**
 * @typedef {Object} ServerEntry
 * @property {import('node:child_process').ChildProcess} proc
 * @property {Set<import('node:http').ServerResponse>} sessions
 * @property {import('node:readline').Interface} rl
 * @property {NodeJS.Timeout|null} keepAliveTimer
 */

// ── Config loading ────────────────────────────────────────────────────────────

function configPath() {
  return join(__dirname, '..', 'llm', 'mcp-bridge.json');
}

function loadConfig() {
  const file = configPath();
  if (!existsSync(file)) {
    console.warn('[mcp-bridge] config not found:', file);
    return null;
  }
  return JSON.parse(readFileSync(file, 'utf-8'));
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Der llama-Web-UI-Browser (http://localhost:8098) ruft die Bridge cross-origin
// auf. Ohne Preflight-Antwort und CORS-Header blockiert der Browser den Request
// ("Failed to fetch"). OPTIONS wird deshalb VOR der Auth-Pruefung beantwortet.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function withCors(headers = {}) {
  return { ...CORS_HEADERS, ...headers };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkAuth(req, srvCfg) {
  const tokenEnv = srvCfg.bearerTokenEnv;
  if (!tokenEnv) return true;
  const expected = process.env[tokenEnv];
  if (!expected) return true;
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const parts = auth.split(/\s+/);
  return parts.length === 2 && parts[0].toLowerCase() === 'bearer' && parts[1] === expected;
}

// ── Environment variable resolution ──────────────────────────────────────────

function resolveEnvVars(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = String(v).replace(/\{env:([^}]+)\}/g, (_, name) => process.env[name] || '');
  }
  return out;
}

// ── Process lifecycle ─────────────────────────────────────────────────────────

/**
 * Spawn a child process for a server and set up event handlers.
 * @param {string} name
 * @param {object} srvCfg
 * @returns {ServerEntry}
 */
function createServerEntry(name, srvCfg) {
  const childEnv = { ...process.env, ...resolveEnvVars(srvCfg.env || {}) };

  const proc = spawn(srvCfg.command, srvCfg.args || [], {
    cwd: srvCfg.cwd || process.cwd(),
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const sessions = new Set();

  // T002548 — Handshake-Zustand des Kindes.
  //
  // Die Bruecke teilt EINEN Kindprozess ueber alle HTTP-Sessions (T002429 §3.1),
  // waehrend MCP `initialize` einmal pro Session vorsieht. Ein spec-treuer Server
  // lehnt jedes weitere mit "duplicate 'initialize' received" ab. Deshalb fuehrt
  // die Bruecke den Handshake genau einmal und beantwortet spaetere Anfragen aus
  // `initResult` selbst. Der Zustand haengt am Kindprozess, nicht an der Route:
  // beim Neustart (proc.on('exit') -> createServerEntry) entsteht er frisch, was
  // korrekt ist — der neue Prozess hat noch keinen Handshake gesehen.
  const handshake = { initResult: null, pendingInitId: null, notified: false };

  // Read stdout line by line – each line is a JSON-RPC message
  const rl = createInterface({ input: proc.stdout });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    broadcastToSessions(sessions, trimmed);

    // Streamable-HTTP mode: deliver the child's response directly to the
    // POST that originated the request (matched by JSON-RPC id).
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // not a JSON-RPC line (child log output)
    }
    if (msg && msg.id !== undefined) {
      const key = String(msg.id);

      // Antwort auf den einen Handshake, den wir durchgereicht haben → merken.
      // Nur `result` wird gecacht: ein Fehler darf nicht als gueltiger Handshake
      // konserviert werden, sonst bekaeme jede spaetere Session denselben Fehler
      // ohne Chance auf einen neuen Versuch.
      if (handshake.pendingInitId !== null && key === handshake.pendingInitId) {
        handshake.pendingInitId = null;
        if (msg.result !== undefined) handshake.initResult = msg.result;
      }

      const p = pending.get(key);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(key);
        if (!p.res.headersSent) {
          p.res.writeHead(200, withCors({ 'content-type': 'application/json' }));
          p.res.end(trimmed);
        }
      }
    }
  });

  // Log stderr
  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[mcp-bridge:${name}]`, msg);
  });

  // Auto-restart on exit
  proc.on('exit', (code, signal) => {
    console.error(`[mcp-bridge] ${name}: exited code=${code} signal=${signal}`);
    closeAllSessions(sessions);
    rl.close();
    servers.delete(name);

    // Re-create if still enabled
    if (config && config.servers[name] && config.servers[name].enabled) {
      console.log(`[mcp-bridge] ${name}: restarting in 1s...`);
      setTimeout(() => {
        servers.set(name, createServerEntry(name, config.servers[name]));
      }, 1000);
    }
  });

  proc.on('error', (err) => {
    console.error(`[mcp-bridge] ${name}: spawn error`, err.message);
  });

  return { proc, sessions, rl, keepAliveTimer: null, handshake };
}

function broadcastToSessions(sessions, line) {
  const data = `event: message\ndata: ${line}\n\n`;
  for (const session of sessions) {
    try {
      session.write(data);
    } catch {
      sessions.delete(session);
    }
  }
}

function closeAllSessions(sessions) {
  for (const session of sessions) {
    try { session.end(); } catch { /* ignore */ }
  }
  sessions.clear();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the bridge: load config, start all enabled servers.
 * Best-effort – logs errors, never throws.
 */
async function initBridge() {
  try {
    config = loadConfig();
    if (!config) return;
    for (const [name, srvCfg] of Object.entries(config.servers)) {
      if (!srvCfg.enabled) continue;
      servers.set(name, createServerEntry(name, srvCfg));
      console.log(`[mcp-bridge] ${name}: started`);
    }
  } catch (err) {
    console.error('[mcp-bridge] init error:', err.message);
  }
}

/**
 * Handle an incoming request for /mcp/<name>.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} serverName  – from URL path segment
 * @param {string} method      – HTTP method ('GET' | 'POST')
 */
function handleMcp(req, res, serverName, method) {
  if (method === 'OPTIONS') {
    const requested = req.headers['access-control-request-headers'];
    res.writeHead(204, requested
      ? { ...CORS_HEADERS, 'access-control-allow-headers': requested }
      : CORS_HEADERS);
    res.end();
    return;
  }

  const entry = servers.get(serverName);
  if (!entry) {
    res.writeHead(404, withCors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ error: { code: 'server_not_found', message: `no enabled MCP server: ${serverName}` } }));
    return;
  }

  const srvCfg = config?.servers?.[serverName];
  if (!srvCfg) {
    res.writeHead(404, withCors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ error: { code: 'config_missing', message: `server ${serverName} not in config` } }));
    return;
  }

  // Auth check
  if (!checkAuth(req, srvCfg)) {
    res.writeHead(401, withCors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ error: { code: 'unauthorized', message: 'invalid or missing bearer token' } }));
    return;
  }

  // Check process health
  if (!entry.proc || entry.proc.killed || !entry.proc.stdin.writable) {
    res.writeHead(503, withCors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ error: { code: 'server_unavailable', message: `${serverName} is restarting` } }));
    return;
  }

  if (method === 'GET') {
    // ── SSE stream setup ──
    res.writeHead(200, withCors({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    }));

    // Send session_id event (MCP SSE transport handshake)
    const sessionId = randomUUID();
    res.write(`event: session_id\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    // Register session
    entry.sessions.add(res);

    // Deregister on client disconnect
    req.on('close', () => {
      entry.sessions.delete(res);
      // If the client that initiated the keep-alive disconnects, the timer
      // will be cleaned up on the next tick anyway – but we clear the ref
      // so the event loop isn't held open.
    });

    // SSE keepalive (comment line every 15s prevents proxy/load-balancer timeouts)
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        entry.sessions.delete(res);
      }
    }, 15_000);

    req.on('close', () => clearInterval(keepAlive));

  } else if (method === 'POST') {
    // ── JSON-RPC dispatch ──
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        res.writeHead(400, withCors({ 'content-type': 'application/json' }));
        res.end(JSON.stringify({ error: { code: 'invalid_json', message: 'request body is not valid JSON' } }));
        return;
      }

      if (!message.jsonrpc || !message.method) {
        res.writeHead(400, withCors({ 'content-type': 'application/json' }));
        res.end(JSON.stringify({ error: { code: 'invalid_rpc', message: 'missing jsonrpc or method field' } }));
        return;
      }

      // T002548 — Handshake nicht durchreichen, wenn er schon gefuehrt wurde.
      //
      // MCP sieht `initialize` einmal pro Session vor, die Bruecke teilt aber
      // einen Kindprozess. Ohne diesen Abfang antwortet ein spec-treuer Server
      // (github-mcp-server v1.8.0) jeder zweiten Session mit
      // "duplicate 'initialize' received". Die Antwort traegt die id des
      // ANFRAGENDEN Clients, nicht die des ersten — sonst ordnet sein
      // JSON-RPC-Layer sie keiner Anfrage zu.
      const hs = entry.handshake;
      if (hs) {
        if (message.method === 'initialize') {
          if (hs.initResult !== null) {
            res.writeHead(200, withCors({ 'content-type': 'application/json' }));
            res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: hs.initResult }));
            return;
          }
          hs.pendingInitId = String(message.id);
        } else if (message.method === 'notifications/initialized') {
          // Auch diese Notification gehoert einmal pro Session — der geteilte
          // Prozess hat sie nach dem ersten Mal gesehen. 202 wie bei jeder
          // Notification, nur ohne Schreibvorgang.
          if (hs.notified) {
            res.writeHead(202, withCors());
            res.end();
            return;
          }
          hs.notified = true;
        }
      }

      try {
        entry.proc.stdin.write(JSON.stringify(message) + '\n');
      } catch (err) {
        res.writeHead(503, withCors({ 'content-type': 'application/json' }));
        res.end(JSON.stringify({ error: { code: 'write_error', message: err.message } }));
        return;
      }

      // Notifications have no id → the child sends no response. Acknowledge
      // with an empty 202 (spec-compliant; body only on 200).
      if (message.id === undefined) {
        res.writeHead(202, withCors());
        res.end();
        return;
      }

      // Request → answer directly with the child's result (streamable_http).
      // The child also broadcasts to open SSE sessions for legacy clients.
      const timer = setTimeout(() => {
        pending.delete(String(message.id));
        if (!res.headersSent) {
          res.writeHead(504, withCors({ 'content-type': 'application/json' }));
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'bridge timeout: no response from child server' },
          }));
        }
      }, 30_000);
      pending.set(String(message.id), { res, timer });
    });

  } else {
    res.writeHead(405, withCors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ error: { code: 'method_not_allowed', message: `${method} not supported` } }));
  }
}

/**
 * Gracefully stop all child processes and close all SSE sessions.
 */
function stopBridge() {
  for (const [name, entry] of servers) {
    closeAllSessions(entry.sessions);
    entry.rl.close();
    if (entry.proc && !entry.proc.killed) {
      entry.proc.kill();
    }
    console.log(`[mcp-bridge] ${name}: stopped`);
  }
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    if (!p.res.headersSent) {
      p.res.writeHead(503, withCors({ 'content-type': 'application/json' }));
      p.res.end(JSON.stringify({ error: { code: 'server_stopped', message: 'bridge stopped' } }));
    }
  }
  pending.clear();
  servers.clear();
  config = null;
}

export { initBridge, handleMcp, stopBridge };
