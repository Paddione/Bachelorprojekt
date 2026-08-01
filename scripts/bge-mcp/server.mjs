#!/usr/bin/env node
// scripts/bge-mcp/server.mjs
//
// T002426 — bge-MCP-Shim: Embedding und Reranking als MCP-Ressource.
//
// WARUM DIESER SERVER UEBERHAUPT EXISTIERT
// `llama-server` kann sich NICHT selbst als MCP-Server exponieren. Sein Flag
// `--mcp-servers-config` (scripts/llm-proxy/runner.mjs) ist llama.cpps
// MCP-*Client*-Pfad: darueber ruft das Modell fremde Tools auf. Die umgekehrte
// Richtung — das Modell als Ressource anbieten — gibt es dort nicht. Der Shim
// ist deshalb kein Umweg, sondern die einzige Bauform, die die Anforderung
// erfuellt.
//
// TRANSPORT IST HTTP, NICHT STDIO — harte Festlegung.
// Die Web-UI von `llama-server` (Seite „MCP Servers") nimmt beim Hinzufuegen
// ausschliesslich eine URL entgegen; ein stdio-Shim waere dort prinzipiell
// unerreichbar. Ueber HTTP ist er in beiden Welten nutzbar: direkt in der
// llama-UI eintragbar und ueber docs/agent-guide/registry/mcp.yaml an Claude
// Code, opencode und agy verteilbar.
//
// SICHERHEIT: Bind auf 127.0.0.1 plus Bearer-Token. Ueber HTTP entfaellt die
// implizite Authentifizierung, die stdio dadurch hat, dass nur der startende
// Prozess den Server erreicht.
//
// KEINE EIGENE FAILOVER-LOGIK. Welches Paar antwortet, entscheidet
// `website/src/lib/bge-router.ts` — dasselbe Modul, das auch die HTTP-Endpunkte
// und die Bestandsclients benutzen. Node strippt beim Import die Typen; deshalb
// laedt der Router seinen Logger lazy (siehe Kommentar dort). Eine zweite
// Failover-Implementierung hier waere genau die Divergenz, die dieser Vorgang
// beseitigt.
//
// Start:
//   BGE_MCP_TOKEN=<token> node scripts/bge-mcp/server.mjs
// Optional:
//   BGE_MCP_PORT (Default 13005), BGE_MCP_HOST (Default 127.0.0.1)

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTER_PATH = resolvePath(HERE, '../../website/src/lib/bge-router.ts');
const { resolvePair, BgeRoutingError } = await import(ROUTER_PATH);

const HOST = process.env.BGE_MCP_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.BGE_MCP_PORT ?? '13005', 10);
const TOKEN = process.env.BGE_MCP_TOKEN ?? '';
const PROTOCOL_VERSION = '2025-06-18';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, mcp-protocol-version',
  'access-control-max-age': '86400',
};

const TOOLS = [
  {
    name: 'bge_embed',
    description:
      'Embeds one or more texts with bge-m3 and returns the vectors. The caller passes plain text — '
      + 'model name, vector dimension and the serving pair are resolved server-side.',
    inputSchema: {
      type: 'object',
      properties: {
        texts: { type: 'array', items: { type: 'string' }, description: 'Texts to embed.' },
        purpose: {
          type: 'string', enum: ['query', 'index'],
          description: 'query (default) prefers the interactive pair, index prefers the batch pair.',
        },
      },
      required: ['texts'],
    },
  },
  {
    name: 'bge_rerank',
    description:
      'Re-ranks candidate documents against a query with bge-reranker-v2-m3 and returns them sorted '
      + 'by descending relevance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        documents: { type: 'array', items: { type: 'string' } },
        top_k: { type: 'integer', minimum: 1 },
      },
      required: ['query', 'documents'],
    },
  },
];

/** @returns {Promise<{url: string, pair: string}>} */
async function target(preferred, role) {
  const choice = await resolvePair(preferred, role);
  return { url: choice.url, pair: choice.pair };
}

async function embed(args) {
  const texts = Array.isArray(args?.texts) ? args.texts.filter((t) => typeof t === 'string') : [];
  if (texts.length === 0) throw new Error('bge_embed: "texts" must be a non-empty array of strings');
  const preferred = args?.purpose === 'index' ? 'batch' : 'interactive';
  const { url, pair } = await target(preferred, 'embed');

  const r = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.LLM_EMBED_MODEL ?? 'bge-m3', input: texts }),
  });
  if (!r.ok) throw new Error(`bge_embed: pair ${pair} answered ${r.status}`);
  const body = await r.json();
  return {
    pair,
    dimensions: body.data?.[0]?.embedding?.length ?? 0,
    embeddings: (body.data ?? []).map((d) => d.embedding),
  };
}

async function rerank(args) {
  const query = typeof args?.query === 'string' ? args.query : '';
  const documents = Array.isArray(args?.documents)
    ? args.documents.filter((d) => typeof d === 'string') : [];
  if (!query) throw new Error('bge_rerank: "query" is required');
  if (documents.length === 0) throw new Error('bge_rerank: "documents" must be a non-empty array');
  const { url, pair } = await target('interactive', 'rerank');

  const r = await fetch(`${url}/v1/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3',
      query,
      documents,
    }),
  });
  if (!r.ok) throw new Error(`bge_rerank: pair ${pair} answered ${r.status}`);
  const body = await r.json();
  const ranked = (body.results ?? [])
    .map(({ index, relevance_score }) => ({ document: documents[index], score: relevance_score }))
    .sort((a, b) => b.score - a.score);
  const limit = Number.isInteger(args?.top_k) && args.top_k > 0 ? args.top_k : ranked.length;
  return { pair, results: ranked.slice(0, limit) };
}

async function callTool(name, args) {
  try {
    const payload = name === 'bge_embed' ? await embed(args)
      : name === 'bge_rerank' ? await rerank(args)
      : null;
    if (payload === null) {
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
  } catch (err) {
    // Fail-closed: sind beide Paare aus, meldet das Tool einen Fehler an den
    // Aufrufer. Keine leeren Vektoren, keine unsortierten Kandidaten — genau
    // diese stillen Ersatzwerte liessen den toten Reranker wochenlang unbemerkt.
    const reason = err instanceof BgeRoutingError
      ? `no bge pair reachable: ${err.message}`
      : (err?.message ?? String(err));
    return { content: [{ type: 'text', text: reason }], isError: true };
  }
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(msg) {
  const { id, method, params } = msg ?? {};
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'bge-mcp', version: '1.0.0' },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // Notification — keine Antwort.
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call':
      return ok(id, await callTool(params?.name, params?.arguments ?? {}));
    default:
      return fail(id, -32601, `method not found: ${method}`);
  }
}

function authorized(req) {
  if (!TOKEN) return false;
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${TOKEN}`;
}

function readBody(req) {
  return new Promise((res, rej) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 8_000_000) rej(new Error('payload too large')); });
    req.on('end', () => res(raw));
    req.on('error', rej);
  });
}

const server = createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...CORS_HEADERS, ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  if (req.method === 'OPTIONS') {
    const requested = req.headers['access-control-request-headers'];
    res.writeHead(204, requested
      ? { ...CORS_HEADERS, 'access-control-allow-headers': requested }
      : CORS_HEADERS);
    res.end();
    return undefined;
  }

  if (!authorized(req)) {
    // Bearer-Pflicht auch fuer GET: der Bind auf 127.0.0.1 schuetzt nur gegen
    // das Netz, nicht gegen andere Prozesse auf demselben Host.
    return send(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
  }

  if (req.method === 'GET') {
    // SSE-Kanal fuer Clients, die ihn erwarten. Der Shim sendet von sich aus
    // nichts; er haelt die Verbindung nur offen.
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      ...CORS_HEADERS,
    });
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
    req.on('close', () => clearInterval(beat));
    return undefined;
  }

  if (req.method !== 'POST') return send(405, { error: 'method not allowed' });

  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    return send(400, fail(null, -32700, 'parse error'));
  }

  const batch = Array.isArray(parsed) ? parsed : [parsed];
  const answers = (await Promise.all(batch.map(handleRpc))).filter((a) => a !== null);
  if (answers.length === 0) return send(202, '');
  return send(200, Array.isArray(parsed) ? answers : answers[0]);
});

if (!TOKEN) {
  console.error('bge-mcp: BGE_MCP_TOKEN is unset — refusing to start without authentication');
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.error(`bge-mcp listening on http://${HOST}:${PORT} (tools: bge_embed, bge_rerank)`);
});
