#!/usr/bin/env node
// scripts/factory-mcp-node/server.mjs
//
// Port des Go-factory-mcp-Servers (scripts/factory/mcp-go/main.go) auf
// Node.js-stdlib. Kein npm-Abhaengigkeiten — nur http, fs, path,
// child_process, crypto, os.

import { createServer } from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Env-Helfer
// ---------------------------------------------------------------------------

function envOr(key, def) {
  return process.env[key] || def;
}

function repo() {
  // Windows-Pfade in Forward-Slashes umwandeln — die Shell erwartet unix-artige Pfade.
  return normalize(envOr('FACTORY_REPO', '/home/patrick/Bachelorprojekt'));
}

function port() {
  return envOr('FACTORY_MCP_PORT', '13003');
}

function openspecURL() {
  return envOr('OPENSPEC_SEARCH_URL', 'http://localhost:4321');
}

function llmKey() {
  return envOr('FACTORY_LLM_API_KEY', 'lmstudio');
}

// ---------------------------------------------------------------------------
// Staleness-Selbstcheck (gleiche Logik wie Go: process-exe vs. disk-exe hash)
// ---------------------------------------------------------------------------

function hashFile(path) {
  try {
    const buf = readFileSync(path);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return '';
  }
}

function serverStale() {
  // /proc/self/exe ist Linux — auf Windows nicht verfuegbar, dann false.
  // process.execPath gibt den eigenen Executable-Pfad.
  try {
    let hProc = '';
    try { hProc = hashFile('/proc/self/exe'); } catch { /* Linux only */ }
    if (hProc === '') {
      // Fallback: process.execPath (kann auf Windows ein Verzeichnis sein)
      try { hProc = hashFile(process.execPath); } catch { return false; }
    }
    const hDisk = hashFile(process.execPath);
    if (hProc === '' || hDisk === '') return false;
    return hProc !== hDisk;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LLM-Route loesen (gleicher Fallback wie Go)
// ---------------------------------------------------------------------------

function resolveLLM() {
  try {
    // Versuche route-provider.sh (wie Go)
    const out = spawnSync('bash', [
      repo() + '/scripts/factory/route-provider.sh',
      'factory-ask',
      'haiku',
    ], { timeout: 5000 });
    if (out.status === 0 && out.stdout) {
      const route = JSON.parse(out.stdout.toString().trim());
      if (route?.baseUrl && route.baseUrl !== '') {
        let u = route.baseUrl.replace(/\/+$/, '');
        if (!u.endsWith('/v1')) u += '/v1';
        return {
          baseURL: u,
          model: route.modelId || envOr('FACTORY_LLM_MODEL', 'qwen38-220k'),
          slotID: route.slotId || '',
          apiKeyEnv: route.apiKeyEnv || '',
          ctx: route.ctx || 0,
        };
      }
    }
  } catch { /* Fallback: env overrides */ }
  return {
    baseURL: envOr('FACTORY_LLM_URL', 'http://127.0.0.1:18235/v1'),
    model: envOr('FACTORY_LLM_MODEL', 'qwen38-220k'),
    slotID: '',
    apiKeyEnv: '',
    ctx: 0,
  };
}

function resolveAuthKey(apiKeyEnv) {
  if (apiKeyEnv && process.env[apiKeyEnv]) {
    return process.env[apiKeyEnv];
  }
  return llmKey();
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Konstanten
// ---------------------------------------------------------------------------

const CODE_PARSE = -32700;
const CODE_INVALID_REQUEST = -32600;
const CODE_METHOD_NOT_FOUND = -32601;
const CODE_INVALID_PARAMS = -32602;
const CODE_INTERNAL = -32603;

// ---------------------------------------------------------------------------
// Server-Info
// ---------------------------------------------------------------------------

const SERVER_NAME = 'factory-mcp';
const SERVER_VERSION = '2.0.0';

// ---------------------------------------------------------------------------
// CORS-Middleware
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function applyCORS(res, req) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  const reqHeaders = req.headers['access-control-request-headers'];
  if (reqHeaders) {
    res.setHeader('access-control-allow-headers', reqHeaders);
  }
}

// ---------------------------------------------------------------------------
// psql-Helper (identisch zur Go-Variante)
// ---------------------------------------------------------------------------

function psqlJSON(sql) {
  const r = repo();
  // Forward-Slashes sicherstellen
  const unixRepo = r.split(sep).join('/');
  const heredoc =
    `source "${unixRepo}/scripts/factory/lib.sh" && factory_resolve && cat <<'SQL' | factory_psql -tA\n` +
    sql + '\nSQL';
  const out = spawnSync('bash', ['-c', heredoc], { timeout: 15000 });
  return out.status === 0
    ? (out.stdout?.toString().trim() || '')
    : '{"error":' + JSON.stringify(out.stderr?.toString().trim() || '') + '}';
}

// ---------------------------------------------------------------------------
// queue.sh SSOT [T014936]
// ---------------------------------------------------------------------------

function queueJSON() {
  const out = spawnSync('bash', [repo() + '/scripts/factory/queue.sh'], { timeout: 20000 });
  if (out.status !== 0) {
    throw new Error('queue.sh failed: ' + (out.stderr?.toString().trim() || ''));
  }
  return out.stdout?.toString().trim() || '';
}

// ---------------------------------------------------------------------------
// countByStatus — rein syntaktisch, unit-testbar ohne Cluster
// ---------------------------------------------------------------------------

function countByStatus(raw) {
  const counts = {};
  try {
    const entries = JSON.parse(raw);
    for (const e of entries) {
      if (e.status) counts[e.status] = (counts[e.status] || 0) + 1;
    }
  } catch { /* ignore */ }
  return counts;
}

// atoiOrRaw — psql-Zahl in JSON-int; bei unerwartetem Format Rohwert
function atoiOrRaw(s) {
  const trimmed = s.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Tool-Schema (7 Tools, 1:1 zum Go-Schema)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'factory_status',
    description:
      'Queue depth and tick state. backlog/plan_staged = dispatchable counts from ' +
      'scripts/factory/queue.sh (incl. lastenheft_locked, execution_released, ' +
      'factory_excluded gates); *_total = raw row counts without gates; ' +
      'tick_running = lock state.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'factory_queue',
    description:
      'List exactly the tickets the next factory tick would pick (dispatchable lanes ' +
      'from scripts/factory/queue.sh) — not the raw backlog inventory ' +
      '(see factory_status *_total).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'factory_enqueue',
    description: 'Enqueue a ticket into the factory backlog',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'string', description: 'Ticket external_id (e.g. T000123)' },
      },
      required: ['ticket_id'],
    },
  },
  {
    name: 'factory_trigger',
    description: 'Trigger an immediate factory tick (runs wakeup.sh in background)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'factory_recent',
    description: 'Show last N factory run comments from ticket_comments',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent entries (default 10, max 50)' },
      },
    },
  },
  {
    name: 'openspec_find_similar',
    description: 'Findet semantisch ähnliche OpenSpec Changes zu einer Suchanfrage (wraps /api/openspec/search)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchanfrage' },
        limit: { type: 'number', description: 'Default 5' },
        status: { type: 'string', description: 'Filter: planning | plan_staged | archived' },
      },
      required: ['query'],
    },
  },
  {
    name: 'factory_ask',
    description:
      'Ask a natural-language question about the Software Factory. ' +
      'Backed by local Qwen 3.5 9B. For actions (enqueue/trigger/...), prefer the dedicated tools.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Free-form question about factory state, processes, or conventions' },
      },
      required: ['question'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool-Implementierungen
// ---------------------------------------------------------------------------

function toolFactoryStatus() {
  // Lock prüfen: flock -n auf /tmp/factory-tick.lock
  let lockHeld = 'false';
  try {
    const r = spawnSync(
      'bash',
      ['-c', `test -f /tmp/factory-tick.lock || { echo 'false'; exit; }; (flock -n 9 2>/dev/null && echo 'false' || echo 'true') 9>/tmp/factory-tick.lock`],
      { timeout: 3000 },
    );
    if (r.status === 0 && r.stdout) {
      lockHeld = r.stdout.toString().trim();
    }
  } catch { /* lock check failed — default false */ }

  const queueRaw = queueJSON();
  const dispatchable = countByStatus(queueRaw);

  const backlogTotal = psqlJSON(
    "SELECT count(*) FROM tickets.tickets WHERE status='backlog' AND is_test_data = false",
  );
  const planStagedTotal = psqlJSON(
    "SELECT count(*) FROM tickets.tickets WHERE status='plan_staged' AND is_test_data = false",
  );

  const out = {
    backlog: dispatchable['backlog'] || 0,
    plan_staged: dispatchable['plan_staged'] || 0,
    backlog_total: atoiOrRaw(backlogTotal),
    plan_staged_total: atoiOrRaw(planStagedTotal),
    tick_running: lockHeld === 'true',
    server_stale: serverStale(),
  };
  return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
}

function toolFactoryQueue() {
  const out = queueJSON();
  return { content: [{ type: 'text', text: out }], isError: false };
}

function toolFactoryEnqueue(args) {
  const ticketID = args?.ticket_id;
  if (!ticketID) {
    return { content: [{ type: 'text', text: 'ticket_id is required' }], isError: true };
  }
  const r = repo();
  const unixRepo = r.split(sep).join('/');
  const cmd = `${unixRepo}/scripts/ticket.sh enqueue --id ${ticketID}`;
  const out = spawnSync('bash', ['-c', cmd], { timeout: 15000 });
  if (out.status !== 0) {
    return {
      content: [{ type: 'text', text: `${out.stderr?.toString().trim() || 'enqueue failed'}: ${out.stdout?.toString().trim() || ''}` }],
      isError: true,
    };
  }
  const trimmed = (out.stdout?.toString().trim() || '');
  if (trimmed === '') return { content: [{ type: 'text', text: 'enqueued ' + ticketID }], isError: false };
  return { content: [{ type: 'text', text: trimmed }], isError: false };
}

function toolFactoryTrigger() {
  const cmd = spawn('bash', [repo() + '/scripts/factory/wakeup.sh'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const pid = cmd.pid;
  cmd.unref();
  return { content: [{ type: 'text', text: JSON.stringify({ wakeup_started: true, pid }) }], isError: false };
}

function toolFactoryRecent(args) {
  let limit = 10;
  if (args?.limit != null && args.limit !== 'null') {
    const n = Number(args.limit);
    if (Number.isInteger(n) && n > 0) limit = n;
  }
  if (limit <= 0) limit = 10;
  if (limit > 50) limit = 50;
  const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (
    SELECT ticket_id, author_label AS author, body, created_at
    FROM tickets.ticket_comments
    WHERE author_label='factory'
    ORDER BY created_at DESC LIMIT ${limit}
  ) q;`;
  return { content: [{ type: 'text', text: psqlJSON(sql) }], isError: false };
}

function toolOpenspecSimilar(args) {
  const query = (args?.query || '').toString().trim();
  if (!query) {
    return { content: [{ type: 'text', text: 'query is required' }], isError: true };
  }
  const limit = args?.limit ? Number(args.limit) : 5;
  const status = args?.status ? String(args.status).trim() : '';

  const params = new URLSearchParams();
  params.set('q', query);
  if (limit > 0) params.set('limit', String(limit));
  if (status) params.set('status', status);

  const url = openspecURL() + '/api/openspec/search?' + params.toString();
  try {
    // stdlib fetch ist async — wir verwenden die sync-Variante des Go-Clients nicht.
    // Da tools/call synchrone Antwort erwartet, nutzen wir spawnSync mit curl als Workaround.
    const out = spawnSync('bash', ['-c', `curl -s --max-time 8 '${url}'`], { timeout: 10000 });
    if (out.status !== 0) {
      return { content: [{ type: 'text', text: `openspec search failed: ${out.stderr?.toString().trim() || 'timeout'}` }], isError: true };
    }
    const body = out.stdout?.toString().trim() || '';
    if (body === '') {
      return { content: [{ type: 'text', text: '(empty response)' }], isError: false };
    }
    // Pruefe auf Fehler im JSON (HTTP-Status kann man mit curl -w nicht direkt pruefen,
    // aber die Go-Variante macht dasselbe: body return, wenn status >= 400)
    return { content: [{ type: 'text', text: body }], isError: false };
  } catch (err) {
    return { content: [{ type: 'text', text: `openspec search error: ${err.message}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// factory_ask — LLM Q&A
// ---------------------------------------------------------------------------

const factorySystemPrompt =
  'You are the assistant for the Software Factory MCP server in the bachelorprojekt monorepo.\n' +
  'Answer briefly and concretely. Prefer suggesting the right factory_* tool call when the user\n' +
  'wants an action (factory_status, factory_queue, factory_enqueue, factory_trigger,\n' +
  'factory_recent, openspec_find_similar). When the caller already invoked this tool,\n' +
  'they want a free-form answer, not a tool recommendation.\n' +
  '\n' +
  'Available factory state (read-only via separate tools):\n' +
  '- Tickets in tickets.tickets with statuses triage, planning, plan_staged, backlog, in_progress, in_review, awaiting_deploy, done.\n' +
  '- A factory tick runs periodically (or via factory_trigger) and picks from backlog + plan_staged.\n' +
  '- OpenSpec changes live under openspec/changes/ (proposals) and openspec/specs/ (SSOT).\n' +
  '\n' +
  'Keep replies under 200 words. Respond in the same language as the question.\n' +
  'IMPORTANT: Never emit raw tool-call syntax (like <|tool_call|>…<tool_call|>). Name tools inline as plain text (e.g. "use factory_status").\n' +
  'IMPORTANT: Do not output chain-of-thought or reasoning blocks. Provide the final answer only.';

// Allowlist: read-only tools die factory_ask automatisch ausfuehren darf
const factoryReadOnlyTools = {
  factory_status: toolFactoryStatus,
  factory_queue: toolFactoryQueue,
};

// Regex für raw tool-call emission: <|tool_call|>call:factory_status{}<tool_call|>
const TOOL_CALL_SYNTAX_RE = /<\|tool_call\|>call:([a-z_]+)(?:\{[^}]*\}|\([^)]*\))?<tool_call\|>/g;

function resolveToolCallAnswer(ans) {
  let match;
  TOOL_CALL_SYNTAX_RE.lastIndex = 0;
  match = TOOL_CALL_SYNTAX_RE.exec(ans);
  if (!match) return { answer: ans, handled: false };

  const toolName = match[1];
  const fn = factoryReadOnlyTools[toolName];
  if (fn) {
    try {
      const res = fn({});
      if (res.isError) {
        return { answer: `(model requested tool ${toolName}; execution failed: ${res.content[0]?.text || 'unknown error'})`, handled: true };
      }
      return { answer: res.content[0]?.text || '', handled: true };
    } catch (err) {
      return { answer: `(model requested tool ${toolName}; execution failed: ${err.message})`, handled: true };
    }
  }
  return { answer: `(model requested tool ${toolName} — side effects; NOT executed. Call ${toolName} directly.)`, handled: true };
}

function toolFactoryAsk(args) {
  const question = (args?.question || '').toString().trim();
  if (!question) {
    return { content: [{ type: 'text', text: 'question is required' }], isError: true };
  }

  const { baseURL, model, slotID, apiKeyEnv, ctx } = resolveLLM();

  // Slot release via defer-aequivalent
  let slotSuccess = false;
  const releaseSlot = () => {
    const r = spawnSync(
      'bash',
      [repo() + '/scripts/factory/release-slot.sh', slotID, String(slotSuccess), String(ctx)],
      { timeout: 5000 },
    );
    if (r.status !== 0) {
      console.error(`release-slot.sh failed (slot=${slotID}, success=${slotSuccess}, ctx=${ctx}): ${r.stderr?.toString().trim() || ''}`);
    }
  };

  try {
    const body = {
      model,
      messages: [
        { role: 'system', content: factorySystemPrompt },
        { role: 'user', content: question },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    };
    if (model.toLowerCase().includes('qwen')) {
      body['chat_template_kwargs'] = { enable_thinking: false };
    }

    // LLM-Request via curl (stdlib fetch ist async — MCP expects sync tool response)
    const curlCmd = [
      `curl -s --max-time 45 -X POST '${baseURL}/chat/completions'`,
      `-H 'Content-Type: application/json'`,
      `-H "Authorization: Bearer ${resolveAuthKey(apiKeyEnv)}"`,
      `-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`,
    ].join(' \\');

    const out = spawnSync('bash', ['-c', curlCmd], { timeout: 50000 });
    slotSuccess = true;

    if (out.status !== 0) {
      return { content: [{ type: 'text', text: `llm request failed: ${out.stderr?.toString().trim() || 'timeout'}` }], isError: true };
    }

    const raw = out.stdout?.toString().trim() || '';
    if (!raw) {
      return { content: [{ type: 'text', text: '{"answer":"(empty)","model":"' + model + '"}' }], isError: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { content: [{ type: 'text', text: `llm parse error: ${raw.substring(0, 500)}` }], isError: true };
    }

    if (!parsed?.choices?.length) {
      return { content: [{ type: 'text', text: '{"answer":"(empty)","model":"' + model + '"}' }], isError: false };
    }

    const msg = parsed.choices[0].message || {};
    let ans = (msg.content || '').toString().trim();
    let src = 'content';

    if (!ans && msg.reasoning_content) {
      // Qwen3 reasoning trace — letze "answer:" / "Final answer:" marker extrahieren
      const reasoning = msg.reasoning_content.toString();
      const lower = reasoning.toLowerCase();
      let best = -1;
      for (const marker of ['final answer:', 'answer:']) {
        const i = lower.lastIndexOf(marker);
        if (i > best) best = i + marker.length;
      }
      if (best >= 0) {
        ans = reasoning.substring(best).trim();
      } else {
        // Fallback: letzter Absatz
        const parts = reasoning.split('\n\n');
        if (parts.length > 1) ans = parts[parts.length - 1].trim();
        else ans = reasoning.trim();
      }
      src = 'reasoning_content';
    }

    if (!ans) {
      const finishReason = parsed.choices[0].finish_reason || 'unknown';
      ans = `(model returned empty content, finish_reason=${finishReason})`;
    }

    const resolved = resolveToolCallAnswer(ans);
    if (resolved.handled) {
      ans = resolved.answer;
      src = 'tool_call';
    }

    const result = { answer: ans, model, source: src };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
  } catch (err) {
    releaseSlot();
    return { content: [{ type: 'text', text: `llm request error: ${err.message}` }], isError: true };
  } finally {
    releaseSlot();
  }
}

// ---------------------------------------------------------------------------
// callTool — Dispatcher
// ---------------------------------------------------------------------------

function callTool(name, args) {
  switch (name) {
    case 'factory_status':       return toolFactoryStatus();
    case 'factory_queue':        return toolFactoryQueue();
    case 'factory_enqueue':      return toolFactoryEnqueue(args);
    case 'factory_trigger':      return toolFactoryTrigger();
    case 'factory_recent':       return toolFactoryRecent(args);
    case 'openspec_find_similar':return toolOpenspecSimilar(args);
    case 'factory_ask':          return toolFactoryAsk(args);
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// readBody — Promise-basierter Body-Leser (wie bge-mcp)
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// HTTP-Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  // CORS auf ALLEN Antworten
  applyCORS(res, req);

  // OPTIONS → Pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // Health-Endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      server: 'factory-mcp',
      build: '',
      stale: serverStale(),
    }));
    return;
  }

  // MCP-Endpoint — nur POST
  if (req.url === '/mcp' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: CODE_PARSE, message: 'read body: ' + err.message } }));
      return;
    }

    let reqObj;
    try {
      reqObj = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: CODE_PARSE, message: 'invalid json' } }));
      return;
    }

    // Notifications have no ID — no reply per JSON-RPC 2.0
    if (!reqObj?.id || reqObj.id === null || reqObj.id === 'null' || reqObj.id === '') {
      res.writeHead(204).end();
      return;
    }

    const { id, method, params } = reqObj;
    let result;

    try {
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            capabilities: { tools: {} },
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call':
          result = callTool(params?.name, params?.arguments || {});
          break;
        default:
          result = { isError: true, content: [{ type: 'text', text: `method not found: ${method}` }] };
      }
    } catch (err) {
      result = { isError: true, content: [{ type: 'text', text: 'internal error: ' + err.message }] };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    return;
  }

  // Alles andere → 404
  res.writeHead(404);
  res.end();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(Number(port()), '127.0.0.1', () => {
  console.error(`factory-mcp listening on 127.0.0.1:${port()}`);
});
