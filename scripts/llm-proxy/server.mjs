// scripts/llm-proxy/server.mjs
import http from 'node:http';
import { Readable } from 'node:stream';
import { startRegistryPoll, getBackends, resolveApiKey } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState } from './discovery.mjs';
import { applyFixups } from './fixups.mjs';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;

startRegistryPoll(POLL_MS);
const discovery = startDiscovery(getBackends, POLL_MS);

// Serialisierung + Kontext-Budget (T002102-Folgevorfall, 2026-07-23): mehrere
// gleichzeitige Requests an DENSELBEN Backend teilten sich zuvor server-seitig
// einen KV-Pool (--kv-unified) und liessen sich unter Last nicht mehr sauber
// abschliessen (fertige Slots blieben haengen, einmal voller Server-Crash).
// Der Proxy serialisiert jetzt selbst - pro Backend genau ein Request zur
// selben Zeit, alle weiteren warten in einer FIFO-Queue - und deckelt
// max_tokens pro Request auf das, was nach Abzug des tatsaechlichen
// Prompt-Umfangs vom Backend-Kontext realistisch noch reinpasst, statt
// blind den Client-Wert (oder ein globales Maximum) durchzureichen.
const CTX_MARGIN = Number(process.env.LLM_PROXY_CTX_MARGIN || 1024); // Chat-Template/Tool-Schema-Overhead, den /tokenize nicht sieht
const SAFETY_MARGIN = Number(process.env.LLM_PROXY_SAFETY_MARGIN || 256);
const MIN_OUTPUT_BUDGET = Number(process.env.LLM_PROXY_MIN_OUTPUT || 64);
const PROPS_CACHE_MS = 60_000;

const queues = new Map(); // backend.name -> Promise (Ende der Warteschlange)
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const queuedAt = Date.now();
  const run = prev.then(fn, fn);
  queues.set(key, run.catch(() => {}));
  return { run, queuedAt };
}

const ctxCache = new Map(); // backend.name -> { ctx, fetchedAt }
async function getBackendCtx(backend) {
  const cached = ctxCache.get(backend.name);
  if (cached && Date.now() - cached.fetchedAt < PROPS_CACHE_MS) return cached.ctx;
  if (backend.kind !== 'llamacpp') return null; // nur llama.cpp exponiert /props zuverlaessig
  try {
    const host = backend.baseUrl.replace(/\/v1\/?$/, '');
    const res = await fetch(`${host}/props`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const ctx = body?.default_generation_settings?.n_ctx ?? null;
    ctxCache.set(backend.name, { ctx, fetchedAt: Date.now() });
    return ctx;
  } catch {
    return cached?.ctx ?? null;
  }
}

async function countPromptTokens(backend, messages) {
  if (backend.kind !== 'llamacpp') return null;
  const content = (messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  try {
    const host = backend.baseUrl.replace(/\/v1\/?$/, '');
    const res = await fetch(`${host}/tokenize`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    return Array.isArray(body?.tokens) ? body.tokens.length : null;
  } catch {
    return null;
  }
}

/** Deckelt max_tokens auf das, was nach dem tatsaechlichen Prompt-Umfang noch
 * realistisch in den Backend-Kontext passt. Gibt den unveraenderten Body
 * zurueck, wenn Ctx/Tokenize nicht verfuegbar sind (z. B. Remote-Backends). */
async function applyContextBudget(backend, body) {
  const [ctx, promptTokens] = await Promise.all([
    getBackendCtx(backend),
    countPromptTokens(backend, body.messages),
  ]);
  if (ctx == null || promptTokens == null) return body;

  const budget = Math.max(MIN_OUTPUT_BUDGET, ctx - promptTokens - CTX_MARGIN - SAFETY_MARGIN);
  const requested = body.max_tokens ?? body.n_predict ?? budget;
  const effective = Math.min(requested, budget);
  if (effective !== requested) {
    console.log(`[budget] ${backend.name}: prompt~${promptTokens}/${ctx} → max_tokens ${requested}→${effective}`);
  }
  return { ...body, max_tokens: effective };
}

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': buf.length });
  res.end(buf);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function forwardToBackend(backend, servedModel, subpath, budgetedBody) {
  const headers = { 'content-type': 'application/json' };
  const key = resolveApiKey(backend);
  if (key) headers.authorization = `Bearer ${key}`;
  return fetch(`${backend.baseUrl}${subpath}`, {
    method: 'POST', headers, body: JSON.stringify({ ...budgetedBody, model: servedModel }),
  });
}

async function proxyV1(req, res, subpath) {
  const body = await readBody(req);
  const routed = resolveModel(body.model, getBackends);
  if (!routed) return sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });

  const { backend, servedModel, substituted } = routed;
  const budgetedBody = applyFixups(backend.fixups, await applyContextBudget(backend, body));
  if (substituted) console.log(`[route] ${body.model} → ${backend.name}:${servedModel}`);

  const { run, queuedAt } = enqueue(backend.name, () => forwardToBackend(backend, servedModel, subpath, budgetedBody));
  const waitMs = Date.now() - queuedAt;
  if (waitMs > 250) console.log(`[queue] ${backend.name}: request waited ${waitMs}ms behind an in-flight request`);
  const upstream = await run;

  const passHeaders = { 'x-llm-proxy-backend': backend.name, 'x-llm-proxy-served-model': servedModel };
  for (const h of ['content-type', 'cache-control']) {
    const v = upstream.headers.get(h); if (v) passHeaders[h] = v;
  }
  res.writeHead(upstream.status, passHeaders);
  if (upstream.body) {
    // Backend kann mitten im Stream wegbrechen (Crash, ECONNRESET) - ein
    // unbehandeltes 'error'-Event auf dem gepipten Stream killt sonst den
    // gesamten Prozess (Node-Default fuer EventEmitter ohne Error-Listener).
    // Bei einer serialisierten Queue waere das besonders teuer: ein Crash
    // wuerde JEDEN wartenden Request in der Warteschlange mitreissen.
    const upstreamStream = Readable.fromWeb(upstream.body);
    upstreamStream.on('error', (err) => {
      console.error(`[stream-error] ${backend.name}: ${err.message}`);
      res.destroy();
    });
    res.on('error', () => {});
    upstreamStream.pipe(res);
  } else {
    res.end();
  }
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const path = url.split('?')[0];
  (async () => {
    if (path === '/health') return sendJson(res, 200, { status: 'ok' });
    if (path === '/v1/models' && method === 'GET') return sendJson(res, 200, aggregateModels());
    if (path === '/admin/state' && method === 'GET') return sendJson(res, 200, getState(getBackends));
    if (path === '/admin/reload' && method === 'POST') { await discovery.probeNow(); return sendJson(res, 200, { reloaded: true }); }
    if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3));
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  })().catch((err) => sendJson(res, 502, { error: { code: 'proxy_error', message: err.message } }));
});

await discovery.probeNow();
server.listen(PORT, '127.0.0.1', () => console.log(`[llm-proxy] listening on 127.0.0.1:${PORT}`));
