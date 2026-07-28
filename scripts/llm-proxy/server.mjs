// scripts/llm-proxy/server.mjs
import http from 'node:http';
import { Readable } from 'node:stream';
import { startRegistryPoll, getBackends, resolveApiKey } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState, evaluateReadiness } from './discovery.mjs';
import { applyFixups, sanitizeToolSchemaPatterns } from './fixups.mjs';
import { readFileSync } from 'node:fs';
import { readLoadouts, writeLoadouts, findLoadout, DEFAULT_PATH } from './loadouts.mjs';
import { scanModels, expandRoot } from './models.mjs';
import { unitName, startUnit, stopUnit, unitStatus, recentLogs } from './runner.mjs';
import { join } from 'node:path';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;
const LLAMA_BIN = process.env.LLAMA_SERVER_BIN
  || join(process.env.HOME, 'opt/llama-b10155-cuda13.3/bin/llama-server');
const HEALTH_TIMEOUT_MS = 240_000;

startRegistryPoll(POLL_MS);
const discovery = startDiscovery(getBackends, POLL_MS);

// Serialisierung + Kontext-Budget (T002102-Folgevorfall, 2026-07-23; erweitert
// um per-Backend-Semaphor T002128-p4): mehrere gleichzeitige Requests an DENSELBEN
// Backend serialisiert der Proxy in einem per-Backend-Semaphor. Default max_inflight=1
// => byte-identisch zur bisherigen Promise-Kette (genau 1 in-flight, strikte FIFO).
// max_inflight >1 erlaubt echte Parallelitaet pro Backend (z. B. fuer die Bonsai-
// Gang). Die max_tokens-Deckelung (Context-Budget) bleibt unveraendert erhalten.
const CTX_MARGIN = Number(process.env.LLM_PROXY_CTX_MARGIN || 1024); // Chat-Template/Tool-Schema-Overhead, den /tokenize nicht sieht
const SAFETY_MARGIN = Number(process.env.LLM_PROXY_SAFETY_MARGIN || 256);
const MIN_OUTPUT_BUDGET = Number(process.env.LLM_PROXY_MIN_OUTPUT || 64);
const PROPS_CACHE_MS = 60_000;

// Per-Backend-Semaphor: bis zu `limit` Requests gleichzeitig in-flight, ueberzaehlige warten FIFO.
// limit=1 ist aequivalent zur bisherigen Promise-Ketten-Serialisierung (genau 1 in-flight, strikte
// FIFO) — damit bleibt das Default-Verhalten byte-identisch. Stale Eintraege (Backend faellt aus der
// Registry) laufen auf inflight=0 aus und schaden nicht; kein aktives Cleanup noetig.
const sems = new Map(); // backend.name -> { inflight:number, waiters: Array<() => void> }

function semFor(name) {
  let s = sems.get(name);
  if (!s) { s = { inflight: 0, waiters: [] }; sems.set(name, s); }
  return s;
}

function acquire(name, limit) {
  const s = semFor(name);
  if (s.inflight < limit) { s.inflight++; return Promise.resolve(); }
  return new Promise((resolve) => s.waiters.push(resolve)); // FIFO: hinten anstellen
}

function release(name) {
  const s = semFor(name);
  const next = s.waiters.shift();     // FIFO: vorne entnehmen
  if (next) next();                   // Slot direkt an den naechsten Wartenden weiterreichen (inflight konstant)
  else if (s.inflight > 0) s.inflight--;
}

function enqueue(name, limit, fn) {
  const queuedAt = Date.now();
  const run = acquire(name, limit).then(fn).finally(() => release(name));
  return { run, queuedAt };
}

// exportiert fuer /admin/state (Task 4): aktueller In-Flight-Zaehler eines Backends
function inflightOf(name) { return sems.get(name)?.inflight ?? 0; }

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
  // sanitizeToolSchemaPatterns laeuft UNBEDINGT, nicht als benannter Fixup:
  // ein GBNF-untaugliches Escape zerlegt die Tool-Call-Grammatik jedes
  // llama.cpp-Backends (T002112). Ein Korrektheits-Fix, den man erst in
  // llm_proxy_backends.fixups aktivieren muss, ist genau dann aus, wenn er
  // gebraucht wird. Ohne betroffenes Pattern ist der Aufruf ein No-op.
  const sanitized = sanitizeToolSchemaPatterns(body);
  const budgetedBody = applyFixups(backend.fixups, await applyContextBudget(backend, sanitized));
  if (substituted) console.log(`[route] ${body.model} → ${backend.name}:${servedModel}`);

  const { run, queuedAt } = enqueue(backend.name, backend.maxInflight ?? 1, () => forwardToBackend(backend, servedModel, subpath, budgetedBody));
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

// Loesst den Loadout-Modellpfad gegen die konfigurierten modelRoots auf.
function resolveModelPath(doc, loadout) {
  for (const root of doc.modelRoots) {
    const candidate = join(expandRoot(root), loadout.model);
    try { readFileSync(candidate, { flag: 'r', encoding: null, length: 0 }); return candidate; }
    catch { /* naechste Wurzel */ }
  }
  return null;
}

async function waitHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Ein Server kann auf /health antworten und trotzdem unfaehig sein, ein
// tool_calls-Objekt zu erzeugen -- fuer tool-basiertes Coding wertlos.
async function smokeTestToolCall(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Read the file /etc/hostname using the available tool.' }],
        tools: [{ type: 'function', function: { name: 'read_file', description: 'Read a file from disk',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }],
        tool_choice: 'auto', max_tokens: 256,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await r.json();
    return Array.isArray(body?.choices?.[0]?.message?.tool_calls);
  } catch { return false; }
}

async function chosenSettings(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/props`, { signal: AbortSignal.timeout(5000) });
    const p = await r.json();
    return { ctx: p?.default_generation_settings?.n_ctx ?? null };
  } catch { return { ctx: null }; }
}

function portInUse(doc, port, exceptSlug) {
  return doc.loadouts.some((l) => l.port === port && l.slug !== exceptSlug
    && unitStatus(l.slug).active === 'active');
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const path = url.split('?')[0];
  (async () => {
    // /health beantwortet READINESS: "kann ich bedient werden", nicht "lebe
    // ich" (T002336). Vorher stand hier ein unbedingtes 200 - deshalb blieb am
    // 2026-07-27 ein dreistuendiger Ausfall von llamacpp-gemma unsichtbar.
    // Die Wahrheit liegt bewusst auf /health und nicht auf einem additiven
    // /readyz: wer blind prueft, prueft /health, und genau der wurde getaeuscht.
    if (path === '/health') {
      const r = evaluateReadiness(getBackends);
      // degraded kommt in BEIDEN Faellen mit - der Aufrufer soll sehen, WELCHES
      // Backend fehlt, statt nur dass etwas fehlt.
      return sendJson(res, r.ready ? 200 : 503, {
        status: r.ready ? 'ok' : 'degraded',
        ready: r.ready,
        degraded: r.degraded,
        checked: r.checked,
        lastProbe: getState(getBackends).lastProbe,
      });
    }
    // Reine Liveness - die alte /health-Semantik unter eigenem Namen, fuer
    // Aufrufer, die wirklich nur wissen wollen, ob der Prozess laeuft.
    if (path === '/livez') return sendJson(res, 200, { status: 'ok' });
    if (path === '/v1/models' && method === 'GET') return sendJson(res, 200, aggregateModels());
    if (path === '/admin/state' && method === 'GET') {
      const state = getState(getBackends);
      const limits = new Map(getBackends().map((b) => [b.name, b.maxInflight ?? 1]));
      state.backends = state.backends.map((b) => ({
        ...b,
        inflight: inflightOf(b.name),
        max_inflight: limits.get(b.name) ?? 1,
      }));
      return sendJson(res, 200, state);
    }
    if (path === '/admin/reload' && method === 'POST') { await discovery.probeNow(); return sendJson(res, 200, { reloaded: true }); }

    // --- Loadout-Verwaltung -------------------------------------------------
    if ((path === '/admin' || path === '/admin/') && method === 'GET') {
      const html = readFileSync(new URL('./ui/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (path === '/admin/models' && method === 'GET') {
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { models: scanModels(doc.modelRoots) });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }
    if (path === '/admin/loadouts' && method === 'GET') {
      try {
        const { doc, mtimeMs } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { doc, mtimeMs });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }
    if (path === '/admin/loadouts' && method === 'PUT') {
      try {
        const body = await readBody(req);
        writeLoadouts(body.doc, DEFAULT_PATH, body.mtimeMs ?? null);
        const { mtimeMs } = readLoadouts(DEFAULT_PATH);
        return sendJson(res, 200, { saved: true, mtimeMs });
      } catch (err) {
        const conflict = /conflict|geaendert/i.test(err.message);
        return sendJson(res, conflict ? 409 : 400,
          { error: { code: conflict ? 'stale_write' : 'invalid', message: err.message } });
      }
    }
    if (path === '/admin/loadouts/status' && method === 'GET') {
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        const status = await Promise.all(doc.loadouts.map(async (l) => {
          const u = unitStatus(l.slug);
          const running = u.active === 'active';
          return {
            slug: l.slug, unit: unitName(l.slug), port: l.port,
            active: u.active, sub: u.sub, running,
            chosen: running ? await chosenSettings(l.port) : null,
          };
        }));
        return sendJson(res, 200, { status });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
      }
    }
    const startMatch = path.match(/^\/admin\/loadouts\/([a-z0-9-]+)\/start$/);
    if (startMatch && method === 'POST') {
      const slug = startMatch[1];
      try {
        const { doc } = readLoadouts(DEFAULT_PATH);
        const loadout = findLoadout(doc, slug);
        if (!loadout) return sendJson(res, 404, { error: { code: 'not_found', message: slug } });
        if (unitStatus(slug).active === 'active') {
          return sendJson(res, 409, { error: { code: 'already_running', message: `${slug} laeuft bereits` } });
        }
        if (portInUse(doc, loadout.port, slug)) {
          return sendJson(res, 409, { error: { code: 'port_busy', message: `Port ${loadout.port} belegt` } });
        }
        const modelPath = resolveModelPath(doc, loadout);
        if (!modelPath) {
          return sendJson(res, 422, { error: { code: 'model_missing', message: `${loadout.model} in keiner modelRoot gefunden` } });
        }
        startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN);
        const healthy = await waitHealthy(loadout.port, HEALTH_TIMEOUT_MS);
        if (!healthy) {
          const logs = recentLogs(slug);
          try { stopUnit(slug); } catch { /* Unit war evtl. schon weg */ }
          return sendJson(res, 502, { error: { code: 'start_failed', message: 'Server wurde nicht gesund', logs } });
        }
        const chosen = await chosenSettings(loadout.port);
        const toolCallOk = await smokeTestToolCall(loadout.port);
        await discovery.probeNow();
        return sendJson(res, 201, {
          unit: unitName(slug), port: loadout.port, chosen, toolCallOk,
          warning: toolCallOk ? null : 'Kein tool_calls erzeugt — haeufigste Ursache: args.jinja ist false',
        });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'start_error', message: err.message } });
      }
    }
    const stopMatch = path.match(/^\/admin\/loadouts\/([a-z0-9-]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      const slug = stopMatch[1];
      try {
        stopUnit(slug);
        await discovery.probeNow();
        return sendJson(res, 200, { stopped: slug });
      } catch (err) {
        return sendJson(res, 500, { error: { code: 'stop_error', message: err.message } });
      }
    }

    if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3));
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  })().catch((err) => sendJson(res, 502, { error: { code: 'proxy_error', message: err.message } }));
});

await discovery.probeNow();
server.listen(PORT, '127.0.0.1', () => console.log(`[llm-proxy] listening on 127.0.0.1:${PORT}`));
