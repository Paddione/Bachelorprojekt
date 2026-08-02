// scripts/llm-proxy/server.mjs
import http from 'node:http';
import { Readable } from 'node:stream';
import { startRegistryPoll, getBackends, resolveApiKey } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState, evaluateReadiness } from './discovery.mjs';
import { applyFixups, sanitizeToolSchemaPatterns } from './fixups.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { readLoadouts, writeLoadouts, findLoadout, DEFAULT_PATH, planAutoStart } from './loadouts.mjs';
import os from 'node:os';
import { scanModels, resolveModelPath } from './models.mjs';
import { unitName, startUnit, stopUnit, unitStatus, recentLogs } from './runner.mjs';
import { join } from 'node:path';
import { initBridge, handleMcp, stopBridge } from './mcp-bridge.mjs';
import { generateUiConfigSeed } from '../llm/ui-config-seed.mjs';
import { enqueue, inflightOf, extractSlotId } from './slot-queue.mjs';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;
// Versionsneutraler Symlink statt eines gepinnten Builds (T002536): der
// fruehere Default 'opt/llama-b10155-cuda13.3' zwang bei jedem llama.cpp-Update
// zu einer Code-Aenderung und verhinderte, dass der abgeloeste Build entfernt
// werden kann. 'opt/llama-current' zeigt auf den jeweils aktuellen Build; ein
// Versionswechsel ist damit ein Symlink-Umhaengen ohne Repo-Aenderung.
const LLAMA_BIN = process.env.LLAMA_SERVER_BIN
  || join(process.env.HOME, 'opt/llama-current/bin/llama-server');
const HEALTH_TIMEOUT_MS = 240_000;

startRegistryPoll(POLL_MS);
const discovery = startDiscovery(getBackends, POLL_MS);

// MCP-Bridge init (best-effort: logs errors, never prevents server start)
initBridge().catch((err) => console.error('[mcp-bridge] init failed:', err.message));

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
// Per-Backend-Semaphor ausgelagert nach slot-queue.mjs (T002483): die Semaphor-Logik
// ist jetzt per Slot-id isolierbar. slot-queue.mjs exportiert enqueue(), inflightOf(),
// und extractSlotId().

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
  const auto = await ensureLoadoutForModel(body.model);
  if (auto?.conflict) {
    return sendJson(res, 409, { error: { code: 'exclusive_conflict', message:
      `${body.model} teilt exclusiveGroup mit dem laufenden Loadout ${auto.conflict}. `
      + `Zuerst 'curl -XPOST http://127.0.0.1:${PORT}/admin/loadouts/${auto.conflict}/stop' `
      + `ausfuehren, dann die Anfrage wiederholen — der Proxy stoppt nichts von selbst.` } });
  }
  if (auto?.failed) {
    const e = auto.failed;
    return sendJson(res, e.status ?? 502, { error: { code: e.code ?? 'start_error', message: e.message } });
  }
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

  const slotId = extractSlotId(req);
  const { run, queuedAt } = enqueue(backend.name, backend.maxInflight ?? 1, () => forwardToBackend(backend, servedModel, subpath, budgetedBody), slotId);
  const waitMs = Date.now() - queuedAt;
  if (waitMs > 250) console.log(`[queue] ${backend.name}: request waited ${waitMs}ms behind an in-flight request`);
  const upstream = await run;

  const passHeaders = { 'x-llm-proxy-backend': backend.name, 'x-llm-proxy-served-model': servedModel };
  if (slotId != null) passHeaders['x-llm-proxy-slot'] = String(slotId);
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
// resolveModelPath liegt in models.mjs (T002536) — dort ist es ohne
// Nebenwirkungen testbar. Ein Import von server.mjs startet den HTTP-Server
// und bindet den Proxy-Port; die Funktion war hier also nicht pruefbar.

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

class LoadoutStartError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message); this.status = status; this.code = code; Object.assign(this, extra);
  }
}

async function startLoadout(slug) {
  const { doc } = readLoadouts(DEFAULT_PATH);
  const loadout = findLoadout(doc, slug);
  if (!loadout) throw new LoadoutStartError(404, 'not_found', slug);
  if (unitStatus(slug).active === 'active') {
    throw new LoadoutStartError(409, 'already_running', `${slug} laeuft bereits`);
  }
  if (portInUse(doc, loadout.port, slug)) {
    throw new LoadoutStartError(409, 'port_busy', `Port ${loadout.port} belegt`);
  }
  const modelPath = resolveModelPath(doc, loadout);
  if (!modelPath) {
    throw new LoadoutStartError(422, 'model_missing', `${loadout.model} in keiner modelRoot gefunden`);
  }
  // Resolve draftModelPath and mmprojPath against modelRoots for runner.mjs (P2 contract)
  const resolved = {};
  if (loadout.speculative?.draftModelPath) {
    resolved.draftModelPath = doc.modelRoots.map(r => join(r.replace(/^~/, os.homedir()), loadout.speculative.draftModelPath)).find(existsSync) ?? null;
  }
  if (loadout.args?.mmprojPath) {
    resolved.mmprojPath = doc.modelRoots.map(r => join(r.replace(/^~/, os.homedir()), loadout.args.mmprojPath)).find(existsSync) ?? null;
  }
  if (loadout.uiConfigFile) {
    try {
      generateUiConfigSeed({ outputPath: loadout.uiConfigFile.replace(/^~/, os.homedir()) });
    } catch (err) {
      console.error(`[loadout] Failed to generate uiConfigFile seed for ${slug}:`, err.message);
    }
  }
  startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN, resolved);
  if (!await waitHealthy(loadout.port, HEALTH_TIMEOUT_MS)) {
    const logs = recentLogs(slug);
    try { stopUnit(slug); } catch { /* Unit was already gone */ }
    throw new LoadoutStartError(502, 'start_failed', 'Server wurde nicht gesund', { logs });
  }
  const chosen = await chosenSettings(loadout.port);
  const targetCtx = loadout.args?.ctx ?? loadout.fit?.minCtx ?? null;
  if (targetCtx != null && chosen.ctx != null && chosen.ctx < targetCtx) {
    console.log(`[loadout] ${slug}: -fit gewaehrte ctx ${chosen.ctx} < Ziel ${targetCtx}`);
  }
  const toolCallOk = await smokeTestToolCall(loadout.port);
  await discovery.probeNow();
  return { unit: unitName(slug), port: loadout.port, chosen, toolCallOk };
}

const startsInFlight = new Map();

async function ensureLoadoutForModel(model) {
  let doc;
  try { ({ doc } = readLoadouts(DEFAULT_PATH)); } catch { return null; }
  const activeSlugs = doc.loadouts
    .filter((l) => unitStatus(l.slug).active === 'active')
    .map((l) => l.slug);
  const decision = planAutoStart({ doc, model, activeSlugs });
  if (decision.action === 'none') return null;
  if (decision.action === 'conflict') return { conflict: decision.conflictSlug };
  const pending = startsInFlight.get(decision.slug);
  if (pending) return pending;
  const p = startLoadout(decision.slug)
    .then(() => ({ started: decision.slug }))
    .catch((err) => ({ failed: err }))
    .finally(() => startsInFlight.delete(decision.slug));
  startsInFlight.set(decision.slug, p);
  return p;
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
      try {
        const r = await startLoadout(startMatch[1]);
        return sendJson(res, 201, {
          ...r,
          warning: r.toolCallOk ? null : 'Kein tool_calls erzeugt — haeufigste Ursache: args.jinja ist false',
        });
      } catch (err) {
        if (err instanceof LoadoutStartError) {
          return sendJson(res, err.status, { error: {
            code: err.code, message: err.message, ...(err.logs ? { logs: err.logs } : {}),
          } });
        }
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

    // MCP Bridge — stdio-MCPs via HTTP/SSE
    const mcpMatch = path.match(/^\/mcp\/([a-z0-9-]+)$/);
    if (mcpMatch) return handleMcp(req, res, mcpMatch[1], method);

    if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3));
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  })().catch((err) => sendJson(res, 502, { error: { code: 'proxy_error', message: err.message } }));
});

await discovery.probeNow();
server.listen(PORT, '127.0.0.1', () => console.log(`[llm-proxy] listening on 127.0.0.1:${PORT}`));

// Graceful shutdown: stop MCP bridge processes on exit
function shutdown(signal) {
  console.log(`[llm-proxy] ${signal}: stopping bridge...`);
  stopBridge();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
