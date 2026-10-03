// scripts/toolset/lib/mcp-client.mjs — minimaler MCP-Client für Probes (T900983).
//
// Zwei Transporte, beide ohne npm-Abhängigkeit:
//   - http  : Streamable HTTP. Antwort als application/json ODER text/event-stream (SSE);
//             eine vom Server vergebene Mcp-Session-Id wird für Folgeaufrufe mitgeschickt.
//   - stdio : Prozess starten, zeilengetrenntes JSON-RPC über stdin/stdout.
//
// Bewusst nur das, was ein Probe braucht: initialize → notifications/initialized →
// beliebige Requests (tools/list, tools/call). Kein Resource-/Prompt-Support, keine
// Server→Client-Requests (Sampling, Roots) — ein Server, der so etwas verlangt, gilt
// für den Probe als nicht kooperativ und läuft in den Timeout.
import { spawn } from 'node:child_process';

export const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'bachelorprojekt-toolset-probe', version: '1' };

// Ersetzt ${VAR} durch den Umgebungswert. Fehlt die Variable, bleibt der Platzhalter
// stehen — der Server antwortet dann mit 401, und der Probe meldet auth_failed statt
// still einen leeren Header zu schicken.
export function expandEnv(value, env = process.env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => (env[name] ?? m));
}

export class McpError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'auth_failed' | 'protocol' | 'timeout'
  }
}

// Liest das erste JSON-RPC-Objekt mit passender id aus einem SSE-Body.
function parseSse(text, id) {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data) continue;
    try {
      const msg = JSON.parse(data);
      if (msg && msg.id === id) return msg;
    } catch { /* Keep-alive oder Fremdereignis */ }
  }
  return null;
}

export async function connectHttp({ url, headers = {}, timeoutMs = 15000, env = process.env }) {
  const baseHeaders = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  for (const [k, v] of Object.entries(headers)) baseHeaders[k.toLowerCase()] = expandEnv(v, env);
  let sessionId = null;
  let nextId = 1;

  async function post(body) {
    const h = { ...baseHeaders };
    if (sessionId) h['mcp-session-id'] = sessionId;
    if (body.method !== 'initialize') h['mcp-protocol-version'] = PROTOCOL_VERSION;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: controller.signal });
    } catch (e) {
      throw new McpError(e.name === 'AbortError' ? 'timeout' : 'unreachable', `${url}: ${e.cause?.code ?? e.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new McpError('auth_failed', `${url}: HTTP ${res.status}`);
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    if (body.id === undefined) return null; // Notification: 202 ohne Body
    if (!res.ok) throw new McpError('protocol', `${url}: HTTP ${res.status}`);
    const text = await res.text();
    const ctype = res.headers.get('content-type') || '';
    let msg = null;
    if (ctype.includes('text/event-stream')) msg = parseSse(text, body.id);
    else { try { msg = JSON.parse(text); } catch { /* unten gemeldet */ } }
    if (!msg) throw new McpError('protocol', `${url}: keine JSON-RPC-Antwort für id ${body.id}`);
    if (msg.error) throw new McpError('protocol', `${url}: ${msg.error.message ?? JSON.stringify(msg.error)}`);
    return msg.result;
  }

  const request = (method, params = {}) => post({ jsonrpc: '2.0', id: nextId++, method, params });
  const init = await request('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO });
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return { serverInfo: init?.serverInfo ?? null, request, close: async () => {} };
}

export async function connectStdio({ command, args = [], cwd, env = process.env, timeoutMs = 30000 }) {
  const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buf = '';
  let exited = null;
  let nextId = 1;

  const failAll = (err) => { for (const { reject } of pending.values()) reject(err); pending.clear(); };
  child.on('error', (e) => { exited = e; failAll(new McpError('unreachable', `${command}: ${e.code ?? e.message}`)); });
  child.on('exit', (code) => { exited = exited ?? code; failAll(new McpError('unreachable', `${command}: exited with ${code}`)); });
  child.stderr.on('data', () => {}); // Server-Logs nicht ins Probe-Ergebnis mischen
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; } // Nicht-JSON auf stdout ignorieren
      const p = msg && msg.id !== undefined ? pending.get(msg.id) : null;
      if (!p) continue;
      pending.delete(msg.id);
      if (msg.error) p.reject(new McpError('protocol', `${command}: ${msg.error.message ?? JSON.stringify(msg.error)}`));
      else p.resolve(msg.result);
    }
  });

  function request(method, params = {}) {
    if (exited !== null) return Promise.reject(new McpError('unreachable', `${command}: not running`));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new McpError('timeout', `${command}: ${method} timed out after ${timeoutMs}ms`)); }, timeoutMs);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  const close = async () => {
    if (exited !== null) return;
    child.stdin.end();
    child.kill('SIGTERM');
  };

  try {
    const init = await request('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return { serverInfo: init?.serverInfo ?? null, request, close };
  } catch (e) {
    await close();
    throw e;
  }
}

// Alle Tools eines verbundenen Servers, inklusive Cursor-Paginierung.
export async function listTools(conn) {
  const tools = [];
  let cursor;
  do {
    const res = await conn.request('tools/list', cursor ? { cursor } : {});
    tools.push(...(res?.tools ?? []));
    cursor = res?.nextCursor;
  } while (cursor);
  return tools;
}
