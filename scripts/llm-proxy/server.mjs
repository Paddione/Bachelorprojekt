// scripts/llm-proxy/server.mjs
import http from 'node:http';
import { startRegistryPoll, getBackends, resolveApiKey } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState, evaluateReadiness } from './discovery.mjs';
import { applyFixups, sanitizeToolSchemaPatterns, fillMissingArrayItems } from './fixups.mjs';
import { startListeners } from './listeners.mjs';
// [T900107] Aus loadouts.mjs bleibt nur der Lesepfad: die Datei traegt neben den
// (entfallenen) GPU-Loadouts auch den roles-Block, aus dem die bge-Routen ihre
// Ketten beziehen. Gestartet wird von hier nichts mehr.
import { readLoadouts, DEFAULT_PATH } from './loadouts.mjs';
import { initBridge, handleMcp, stopBridge } from './mcp-bridge.mjs';
import { enqueue, inflightOf, extractSlotId } from './slot-queue.mjs';
import { loadRoles, roleForPath, routeRequest, ROLE_TIMEOUT_MS, resolveRoleChain } from './bge-routes.mjs';
import { respondBuffered, respondStreamed } from './respond.mjs';
import { requestLog } from './request-log.mjs';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;

startRegistryPoll(POLL_MS);
const discovery = startDiscovery(getBackends, POLL_MS);

// MCP-Bridge init (best-effort: logs errors, never prevents server start)
initBridge().catch((err) => console.error('[mcp-bridge] init failed:', err.message));

// T003205 — bge-Rollen-Routen. Die Konfiguration wird beim Start geprueft:
// ein kaputter bge-Block loggt eine Zeile und beantwortet die Rollen-Routen
// mit 503, darf aber die Chat-Routen nicht insgesamt lahmlegen.
let rolesError = null;
try { loadRoles(readLoadouts(DEFAULT_PATH).doc); } catch (err) { rolesError = err; }
if (rolesError) console.error(`[bge-routes] ${rolesError.message}`);

// Serialisierung + Kontext-Budget (T002102-Folgevorfall, 2026-07-23; erweitert
// um per-Backend-Semaphor T002128-p4): mehrere gleichzeitige Requests an DENSELBEN
// Backend serialisiert der Proxy in einem per-Backend-Semaphor. Default max_inflight=1
// => byte-identisch zur bisherigen Promise-Kette (genau 1 in-flight, strikte FIFO).
// max_inflight >1 erlaubt echte Parallelitaet pro Backend. Die max_tokens-Deckelung
// (Context-Budget) bleibt unveraendert erhalten — sie haengt am Modellkontext, nicht
// am Semaphor.
//
// [T012414] Der frueher hier genannte Anwendungsfall "Bonsai-Gang" existiert nicht
// mehr. Aktuell nutzen ihn die GPU-Chat-Backends mit max_inflight=3, passend zu
// '-np 3 -kvu' auf der llama.cpp-Seite: ohne beides zusammen bringt der zweite Slot
// nichts, weil entweder der Server nur einen fuehrt oder der Proxy nur einen
// durchlaesst. Messung: scripts/llm/measurements/2026-08-19-gemma12-slots.md.
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
  const startedAt = Date.now();
  const body = await readBody(req);
  const requestedModel = typeof body.model === 'string' ? body.model.replace(/^[^/]+\//, '') : body.model;

  // [T002657] Lokal-only-Anforderung: der Aufrufer verlangt, dass die Inhalte
  // die eigene Infrastruktur nicht verlassen. Ohne diesen Weg faellt eine
  // korrekt auf on-premises umgestellte Coaching-Konfiguration beim naechsten
  // Trainingslauf ueber die Prioritaetskette wieder auf ein remote-Backend
  // zurueck — der Guard in der Website waere dann umgangen, ohne dass jemand
  // etwas falsch gemacht haette.
  const localOnly = String(req.headers['x-llm-local-only'] ?? '') === '1';
  // [T900107] Kein Auto-Switch mehr. Der Proxy startet nichts: es gibt kein
  // lokales Loadout, das er starten koennte (im Cluster steht keine GPU zur
  // Verfuegung), und die Retry-Schleife existierte ausschliesslich, um die
  // Preemption zwischen konkurrierenden Loadout-Starts abzufangen.
  const routed = resolveModel(requestedModel, getBackends, { localOnly });

  if (!routed) {
    console.log(`[route] ${requestedModel}: resolveModel ergab null (localOnly=${localOnly})`);
    // Bewusst KEINE Substitution auf ein remote-Backend: bei lokal-only ist
    // Fehlschlagen das richtige Ergebnis, Ausweichen waere der Schaden.
    return localOnly
      ? sendJson(res, 503, { error: { code: 'no_local_backend', message:
          'x-llm-local-only: 1 angefordert, aber kein lokales Backend verfuegbar — '
          + 'es wurde NICHT auf ein remote-Backend ausgewichen' } })
      : sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });
  }

  const { backend, servedModel, substituted } = routed;
  // sanitizeToolSchemaPatterns laeuft UNBEDINGT, nicht als benannter Fixup:
  // ein GBNF-untaugliches Escape zerlegt die Tool-Call-Grammatik jedes
  // llama.cpp-Backends (T002112). Ein Korrektheits-Fix, den man erst in
  // llm_proxy_backends.fixups aktivieren muss, ist genau dann aus, wenn er
  // gebraucht wird. Ohne betroffenes Pattern ist der Aufruf ein No-op.
  // fillMissingArrayItems ebenfalls UNBEDINGT, aus demselben Grund (T002633):
  // ein Tool-Schema mit `type: "array"` ohne `items` laesst das Chat-Template
  // von gpt-oss-20b mit HTTP 500 abbrechen ("Function is not a bool value"),
  // weil Jinja dann die gebundene Dict-Methode `.items` statt eines Wertes
  // liest. opencode sendet genau diese Form, also scheiterte JEDER Tool-Aufruf
  // gegen gptoss-context, waehrend reine Chat-Completions liefen. Als benannter
  // Fixup waere er wirkungslos gewesen: 2026-08-03-llm-proxy-gptoss-devstral.sql
  // legt llamacpp-gptoss mit fixups='[]' an. Ohne betroffenes Schema ist der
  // Aufruf ein No-op; er bleibt zusaetzlich in FIXUPS registriert, damit eine
  // bestehende DB-Zeile, die ihn listet, nicht ins Leere zeigt.
  const sanitized = fillMissingArrayItems(sanitizeToolSchemaPatterns(body));
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
  // Kopfdaten des Mitschnitts (T003277). Die Korrelationsfelder kommen vom
  // Aufrufer; fehlen sie, bleiben sie leer statt geraten zu werden.
  const captureMeta = {
    ts: new Date(startedAt).toISOString(),
    backend: backend.name,
    requestedModel: requestedModel ?? null,
    servedModel,
    subpath,
    durationMs: null,
    queueWaitMs: waitMs,
    slotId,
    dispatchTicket: req.headers['x-dispatch-ticket'] ?? null,
    dispatchPartial: req.headers['x-dispatch-partial'] ?? null,
    requestBody: JSON.stringify(budgetedBody),
    expectsSse: budgetedBody?.stream === true,
  };
  // capture wird bewusst NICHT awaited: der Mitschnitt darf den Transport
  // weder verzoegern noch mit einem Fehler beeinflussen.
  const capture = (rec) => requestLog.capture({ ...rec, durationMs: Date.now() - startedAt });

  // T002609: Non-Streaming-Antworten werden gepuffert und vom Turn-Marker
  // befreit, den gemma2-tools.jinja im Klartextpfad im content stehen laesst.
  // Streaming bleibt der rohe pipe-Pfad: dort kann der Marker ueber
  // Chunk-Grenzen zerrissen ankommen, und ein zustandsbehafteter Scanner
  // gehoert nicht in den Pfad, in dem ein Fehler die ganze Queue mitreisst.
  if (upstream.body && budgetedBody?.stream !== true) {
    return respondBuffered({ res, upstream, passHeaders, capture, meta: captureMeta });
  }
  return respondStreamed({ res, upstream, passHeaders, backendName: backend.name, capture, meta: captureMeta });
}

const requestHandler = (req, res) => {
  const { method, url } = req;
  const path = url.split('?')[0];
  (async () => {
    // /health beantwortet READINESS: "kann ich bedient werden", nicht "lebe
    // ich" (T002336). Vorher stand hier ein unbedingtes 200 - deshalb blieb am
    // 2026-07-27 ein dreistuendiger Ausfall von llamacpp-gemma unsichtbar.
    // Die Wahrheit liegt bewusst auf /health und nicht auf einem additiven
    // /readyz: wer blind prueft, prueft /health, und genau der wurde getaeuscht.
    // T002628: Waehrend des GPU-Drainings (Lock gehalten) sind lokale Backends
    // absichtlich zurueckgenommen — der Proxy bedient ueber das Remote-Backend
    // (deepseek). evaluateReadiness zaehlt drainende Backends als ready, nicht
    // als degraded, damit /health gruen bleibt.
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
      state.port = PORT;
      state.uptimeSec = Math.floor(process.uptime());
      state.version = '1.0.0';
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
      res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Die LLM-Proxy-Administration befindet sich im SDLC-Cockpit unter /sdlc.');
    }

    // MCP Bridge — stdio-MCPs via HTTP/SSE
    const mcpMatch = path.match(/^\/mcp\/([a-z0-9-]+)$/);
    if (mcpMatch) return handleMcp(req, res, mcpMatch[1], method);

    // T003205 — bge-Rollen-Routen, GETRENNT von der Chat-Modellaufloesung.
    // Die Rolle kommt aus dem PFAD; die gesamte Failover-Logik liegt in
    // bge-routes.mjs, hier stehen nur die beiden Weiterleitungen.
    if ((path === '/v1/embeddings' || path === '/v1/rerank') && method === 'POST') {
      if (rolesError) {
        return sendJson(res, 503, { error: { code: 'bge_roles_unconfigured', message: rolesError.message } });
      }
      try {
        const body = await readBody(req);
        const { doc } = readLoadouts(DEFAULT_PATH);
        const role = roleForPath(path);
        const chain = resolveRoleChain(role, getBackends(), doc);
        const result = await routeRequest({
          role, path, body, chain, timeoutMs: ROLE_TIMEOUT_MS,
        });
        const headers = { 'content-type': result.contentType ?? 'application/json' };
        if (result.upstream) headers['x-llm-proxy-bge-upstream'] = result.upstream;
        const buf = Buffer.from(result.body, 'utf8');
        res.writeHead(result.status, { ...headers, 'content-length': buf.length });
        return res.end(buf);
      } catch (err) {
        return sendJson(res, 503, { error: { code: 'bge_route_error', message: err.message } });
      }
    }

    if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3));
    return sendJson(res, 404, { error: { code: 'not_found', message: path } });
  })().catch((err) => sendJson(res, 502, { error: { code: 'proxy_error', message: err.message } }));
};

await discovery.probeNow();
// T003277 — Dispatch-Mitschnitt. Der Timer schreibt gebuendelt; ohne ihn
// bliebe der Puffer bis zum Herunterfahren liegen.
requestLog.start();
const listeners = startListeners(requestHandler, PORT, {
  bindOverride: process.env.LLM_PROXY_HOST_BIND || null,
  token: process.env.LLM_PROXY_ADMIN_TOKEN || null,
});

// Graceful shutdown: stop MCP bridge processes on exit
async function shutdown(signal) {
  console.log(`[llm-proxy] ${signal}: stopping bridge and listeners...`);
  for (const s of listeners) s.close();
  stopBridge();
  // Den Puffer noch leeren, statt die letzten Mitschnitte zu verlieren.
  // Wirft nie — stop() kapselt den Schreibfehler.
  await requestLog.stop();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
