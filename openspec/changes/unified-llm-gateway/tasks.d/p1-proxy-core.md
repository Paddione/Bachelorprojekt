# p1-proxy-core — Fixup-Parität, strict Routing, Health & Reasoning-Metrics

Rolle: `impl`. Bringt die vier host-lokalen Proxy-Module (`scripts/llm-proxy/`) auf Cutover-Parität
mit dem Alt-Proxy und härtet Routing + Health: Fix 1 byte-exakt, neuer `billing-header-cache-fixup`
(D2), Wildcard-Alias + strict `resolveModel` (D5), aggregiertes `GET /healthz` + 404 `unknown_model`
+ Reasoning-Metrics light (D4.1/D2), `degraded`-Flag der Registry-Poll (D9). Folgt `design.md`
(Paritäts-Referenz, D2, D4, D5, D9) verbatim. **Kein** `task test:*`-Final-Verify (lebt im
`tasks.md`-Index), **kein** RED-Failing-Test-Step (lebt in `p5-tests`). Jeder Task endet mit einem
lokalen `node --check`/`node -e`-Prüf-Step.

Reihenfolge innerhalb des Partials: Task 1 (`fixups.mjs`) → Task 2 (`discovery.mjs`) → Task 3
(`backends.mjs`) → Task 4 (`server.mjs`), weil `server.mjs` die in Task 2/3 neu exportierten Symbole
`healthSummary` und `getRegistryState` importiert.

## S1-Zeilenbudgets (wirksame Schwelle je Datei; unbaselined ⇒ Extension-Limit `.mjs` = 500)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/llm-proxy/fixups.mjs` | 32 | 468 |
| `scripts/llm-proxy/discovery.mjs` | 99 | 401 |
| `scripts/llm-proxy/server.mjs` | 67 | 433 |
| `scripts/llm-proxy/backends.mjs` | 50 | 450 |

Alle vier Module sind unbaselined und bleiben nach der Änderung mit deutlicher Reserve unter dem
500er-`.mjs`-Limit (geschätzter Endstand: fixups ~50, discovery ~120, backends ~62, server ~135).

---

## Task 1: `fixups.mjs` — Fix 1 byte-exakt + `billing-header-cache-fixup` (D2)

Paritäts-Referenz (`design.md` → „Fixup-Verhalten Alt-Proxy"): Fix 1 schreibt `role:"system"` mit
`i>0` auf `role:"user"` um und lässt den `content` **byte-unverändert** — das bestehende
`[system] `-Präfix ist die Divergenz und muss weg. Fix 2 normalisiert in der Anthropic-Shape
`body.system[0].text` den volatilen Billing-Header (Schutz des llama.cpp-Prompt-Cache-Prefix).

- [ ] `SYSTEM_MARKER`-Konstante entfernen; in `bonsaiSystemRoleFixup` den Rewrite auf `{ ...msg, role: 'user' }` reduzieren (kein Content-Präfix mehr) — der Rest der Funktion (Guard, `.map`, Rückgabe) bleibt.
- [ ] Neuen benannten Fixup `billingHeaderCacheFixup` ergänzen: operiert auf `body.system` (Array/Block-Liste), matcht `system[0].text` gegen die Regex `^x-anthropic-billing-header:.*$` und ersetzt sie durch die Konstante `x-anthropic-billing-header: (normalized-for-cache);`. Nicht-Anthropic-Shapes (kein Array `system`) → No-op-Rückgabe des Originals.
- [ ] Beide Fixups in der `FIXUPS`-Registry unter `bonsai-system-role-fixup` und `billing-header-cache-fixup` registrieren; `applyFixups` bleibt unverändert (iteriert die benannten Namen).
- [ ] Den veralteten Verifikations-Header-Kommentar (der den Nachbau als „zu verifizierende Referenz-Implementierung" markiert) durch die neue Paritäts-Dokumentation ersetzen: Fix 1 = role-Rewrite only / Content byte-identisch, Fix 2 = exakte Regex+Konstante des Alt-Proxys, Verweis auf `design.md` Paritäts-Referenz.

Der Backend-Seed für `llamacpp-bonsai` erweitert die `fixups`-jsonb-Liste um
`billing-header-cache-fixup` — das ist Sache der Registry-Migration in p2-host-rollout, nicht dieses
Partials.

```js
// scripts/llm-proxy/fixups.mjs
// Benannte Request-Fixups — Cutover-Parität zum Alt-Proxy (design.md → Fixup-Verhalten Alt-Proxy):
//   bonsai-system-role-fixup : mid-array role:"system" (i>0) → role:"user", content BYTE-UNVERÄNDERT
//                              (kein Marker/Präfix) — umgeht den Mid-Array-Bug von Bonsai :8093.
//   billing-header-cache-fixup: Anthropic-Shape system[0].text — normalisiert den volatilen Header
//                              ^x-anthropic-billing-header:.*$ auf eine Konstante, damit der
//                              llama.cpp-Prompt-Cache-Prefix stabil bleibt (Fix 2, 2026-07-21).
const BILLING_HEADER_RE = /^x-anthropic-billing-header:.*$/;
const BILLING_HEADER_NORMALIZED = 'x-anthropic-billing-header: (normalized-for-cache);';

function bonsaiSystemRoleFixup(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((msg, i) =>
    i > 0 && msg.role === 'system' ? { ...msg, role: 'user' } : msg,
  );
  return { ...body, messages };
}

function billingHeaderCacheFixup(body) {
  const system = body?.system;
  if (!Array.isArray(system) || system.length === 0) return body;
  const first = system[0];
  if (!first || typeof first.text !== 'string' || !BILLING_HEADER_RE.test(first.text)) return body;
  const nextFirst = { ...first, text: first.text.replace(BILLING_HEADER_RE, BILLING_HEADER_NORMALIZED) };
  return { ...body, system: [nextFirst, ...system.slice(1)] };
}

export const FIXUPS = {
  'bonsai-system-role-fixup': bonsaiSystemRoleFixup,
  'billing-header-cache-fixup': billingHeaderCacheFixup,
};

/** @param {string[]} names @param {any} body */
export function applyFixups(names, body) {
  let out = body;
  for (const name of names || []) {
    const fn = FIXUPS[name];
    if (!fn) { console.warn(`[fixups] unknown fixup "${name}" — skipped`); continue; }
    out = fn(out);
  }
  return out;
}
```

**Verify:**

```bash
node --check scripts/llm-proxy/fixups.mjs
# erwartet: exit 0

node -e "import('./scripts/llm-proxy/fixups.mjs').then(m => {
  const r = m.applyFixups(['bonsai-system-role-fixup'],
    { messages:[{role:'system',content:'a'},{role:'user',content:'b'},{role:'system',content:'c'}] });
  console.log(JSON.stringify(r.messages.map(x => [x.role, x.content])));
  const b = m.applyFixups(['billing-header-cache-fixup'],
    { system:[{type:'text',text:'x-anthropic-billing-header: abc123;'}] });
  console.log(b.system[0].text);
})"
# erwartet:
#   [["system","a"],["user","b"],["user","c"]]   (Content von c OHNE '[system] '-Präfix)
#   x-anthropic-billing-header: (normalized-for-cache);
```

---

## Task 2: `discovery.mjs` — Wildcard-Alias + strict `resolveModel` + `healthSummary` (D5, D4.1)

`resolveModel` bekommt drei geschärfte Stufen (`design.md` D5): Schritt 2 versteht den
Wildcard-Alias-Wert `"*"` (= erstes verfügbares Modell **dieses** Backends); Schritt 3 (globaler
Any-Model-Fallback) läuft nur noch bei `LLM_PROXY_LOOSE_FALLBACK=1`. Statt eines undifferenzierten
`null` liefert die Funktion eine diskriminierte Fehlerrückgabe, die der Server als **404
`unknown_model`** (≥1 Backend gesund, Modell unbekannt) vs. **503 `no_backend`** (kein gesundes
Backend) auflösen kann. Zusätzlich ein `healthSummary`-Helfer für `/healthz`.

- [ ] `resolveModel(requestedId, getBackends)` neu fassen: Schritt 1 exakter Katalog-Treffer (unverändert). Schritt 2 pro Backend `modelAliases[requestedId]`: bei Wert `"*"` und gesundem Backend mit ≥1 Modell → `servedModel = models[0]`; bei konkretem Alias-Wert → bestehende `healthyNames(aliased)`-Prüfung. Schritt 3 nur wenn `process.env.LLM_PROXY_LOOSE_FALLBACK === '1'`: erstes gesundes Backend mit ≥1 Modell.
- [ ] Fehlerrückgabe diskriminieren statt `null`: `{ error: 'no_backend' }` wenn kein Backend gesund ist, sonst `{ error: 'unknown_model' }`. Erfolgsrückgabe bleibt `{ backend, servedModel, substituted }`.
- [ ] Neuen Export `healthSummary(getBackends)` ergänzen: zählt gesunde Backends über die bestehende `health`-Map und liefert `{ healthy_backends, total_backends }` für den `/healthz`-Endpunkt.
- [ ] `probeBackend`, `startDiscovery`, `aggregateModels`, `getState`, `_testSeed` bleiben unverändert.

```js
/** @returns {{backend:import('./backends.mjs').Backend, servedModel:string, substituted:boolean}
 *          | {error:'no_backend'|'unknown_model'}} */
export function resolveModel(requestedId, getBackends) {
  const backends = getBackends();
  const byName = (n) => backends.find((b) => b.name === n);
  const healthyNames = (id) => (catalog.get(id) || []).filter((n) => health.get(n)?.healthy);

  // Schritt 1 — exakter Katalog-Treffer
  const exact = healthyNames(requestedId);
  if (exact.length) return { backend: byName(exact[0]), servedModel: requestedId, substituted: false };

  // Schritt 2 — pro-Backend-Alias inkl. Wildcard "*" (erstes verfügbares Modell des Backends)
  for (const b of backends) {
    const aliased = b.modelAliases?.[requestedId];
    if (!aliased) continue;
    const h = health.get(b.name);
    if (!h?.healthy) continue;
    if (aliased === '*') {
      if (h.models.length) return { backend: b, servedModel: h.models[0], substituted: true };
      continue;
    }
    if (healthyNames(aliased).includes(b.name)) return { backend: b, servedModel: aliased, substituted: true };
  }

  // Schritt 3 — globaler Any-Model-Fallback nur im Loose-Modus (explizites Opt-in)
  if (process.env.LLM_PROXY_LOOSE_FALLBACK === '1') {
    for (const b of backends) {
      const h = health.get(b.name);
      if (h?.healthy && h.models.length) return { backend: b, servedModel: h.models[0], substituted: true };
    }
  }

  // strict: unterscheide „kein gesundes Backend" (503) von „Modell unbekannt" (404)
  const anyHealthy = backends.some((b) => health.get(b.name)?.healthy);
  return { error: anyHealthy ? 'unknown_model' : 'no_backend' };
}

/** @returns {{healthy_backends:number, total_backends:number}} */
export function healthSummary(getBackends) {
  const backends = getBackends();
  const healthy = backends.filter((b) => health.get(b.name)?.healthy).length;
  return { healthy_backends: healthy, total_backends: backends.length };
}
```

**Verify:**

```bash
node --check scripts/llm-proxy/discovery.mjs
# erwartet: exit 0

node -e "import('./scripts/llm-proxy/discovery.mjs').then(m => {
  const backends = [{ name:'bonsai', kind:'llamacpp', baseUrl:'x', priority:1,
    healthy:true, models:['bonsai-8b'], modelAliases:{'ternary-bonsai':'*'} }];
  m._testSeed({ backends });
  const getB = () => backends;
  console.log('wildcard:', JSON.stringify(m.resolveModel('ternary-bonsai', getB)));
  console.log('unknown :', JSON.stringify(m.resolveModel('nope', getB)));
  console.log('summary :', JSON.stringify(m.healthSummary(getB)));
})"
# erwartet:
#   wildcard: {...,"servedModel":"bonsai-8b","substituted":true}
#   unknown : {"error":"unknown_model"}
#   summary : {"healthy_backends":1,"total_backends":1}
```

---

## Task 3: `backends.mjs` — `degraded`-Flag + last-known-good-Zeitstempel (D9, D4.1)

Ein fehlgeschlagener Registry-Poll behält weiterhin den letzten bekannten Cache — jetzt aber
**sichtbar statt silent**: Modul-State `degraded` + Zeitstempel des letzten erfolgreichen Polls,
exponiert über `getRegistryState()`. `server.mjs` liest daraus `registry_poll_age_s` und `degraded`
für `/healthz` und `/admin/state` (`design.md` D4.1/D9).

- [ ] Modul-State `degraded` (Default `false`) und `lastGoodPollAt` (Default `0`) neben dem bestehenden `cache` ergänzen.
- [ ] Im `tick` von `startRegistryPoll`: bei Erfolg `cache` setzen, `lastGoodPollAt = Date.now()`, `degraded = false`, `onUpdate?.(cache)`; im `catch` nur `degraded = true` setzen (Cache + `lastGoodPollAt` unberührt lassen) und wie bisher warnen.
- [ ] Neuen Export `getRegistryState()`: liefert `{ degraded, lastGoodPollAt, pollAgeSeconds }`, wobei `pollAgeSeconds` das Alter des letzten erfolgreichen Polls in ganzen Sekunden ist bzw. `null`, solange noch kein Poll gelang.
- [ ] `loadBackendsOnce`, `getBackends`, `resolveApiKey` bleiben unverändert (die Test-Kurzschluss-Ladung über `LLM_PROXY_BACKENDS_JSON` zählt als erfolgreicher Poll).

```js
let cache = [];
let degraded = false;
let lastGoodPollAt = 0;

export function getBackends() { return cache; }

/** @returns {{degraded:boolean, lastGoodPollAt:number, pollAgeSeconds:number|null}} */
export function getRegistryState() {
  return {
    degraded,
    lastGoodPollAt,
    pollAgeSeconds: lastGoodPollAt ? Math.round((Date.now() - lastGoodPollAt) / 1000) : null,
  };
}

export function resolveApiKey(backend) {
  return backend.apiKeyEnv ? (process.env[backend.apiKeyEnv] || null) : null;
}

export function startRegistryPoll(intervalMs, onUpdate) {
  const tick = () => {
    try {
      cache = loadBackendsOnce();
      lastGoodPollAt = Date.now();
      degraded = false;
      onUpdate?.(cache);
    } catch (err) {
      degraded = true;
      console.warn('[backends] registry poll failed, keeping last state:', err.message);
    }
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
  return t;
}
```

**Verify:**

```bash
node --check scripts/llm-proxy/backends.mjs
# erwartet: exit 0

LLM_PROXY_BACKENDS_JSON='[{"name":"b","kind":"llamacpp","baseUrl":"x","apiKeyEnv":null,"enabled":true,"priority":1,"fixups":[],"modelAliases":{}}]' \
node -e "import('./scripts/llm-proxy/backends.mjs').then(m => {
  m.startRegistryPoll(999999);
  const s = m.getRegistryState();
  console.log(JSON.stringify({ degraded:s.degraded, hasAge:s.pollAgeSeconds !== null, n:m.getBackends().length }));
})"
# erwartet: {"degraded":false,"hasAge":true,"n":1}
```

---

## Task 4: `server.mjs` — `GET /healthz`, 404 `unknown_model`, Reasoning-Metrics light (D4.1, D2, D5)

Vier Ergänzungen am `node:http`-Server (`design.md` D4.1/D5/D2), Endpunkt `/health` bleibt als
Liveness erhalten:
1. `GET /healthz` — aggregiert; 200 nur bei ≥1 gesundem Backend, sonst 503; Body
   `{healthy_backends, total_backends, registry_poll_age_s, degraded}`.
2. `proxyV1` mappt die neue diskriminierte `resolveModel`-Rückgabe: `error:'no_backend'` → 503,
   `error:'unknown_model'` → 404 (unterscheidbar).
3. `/admin/state` zeigt zusätzlich `registry: getRegistryState()` (Staleness/`degraded` sichtbar).
4. Reasoning-Metrics light: Response-Observer über einen Sammelpuffer (deckt non-streaming JSON
   und SSE ab), Extraktion beider Shapes, Schätzung `chars/3.5` mit `estimated:true`, JSONL-Append
   ins Alt-Schema unter `~/.config/factory/reasoning-metrics.jsonl`.

- [ ] Imports erweitern: `getRegistryState` aus `./backends.mjs`, `healthSummary` aus `./discovery.mjs`.
- [ ] Konstanten `REASONING_BUDGET = Number(process.env.REASONING_BUDGET || 8192)`, `METRICS_PATH = join(homedir(), '.config', 'factory', 'reasoning-metrics.jsonl')` und Node-Imports `appendFile`/`mkdir` (aus `node:fs/promises`), `homedir` (aus `node:os`), `dirname`/`join` (aus `node:path`) ergänzen.
- [ ] Helfer `extractReasoningText(raw)` + `reasoningFromObject(obj)`: SSE erkennen (Zeilen `data: …`, `[DONE]` überspringen) und je Payload `reasoningFromObject` summieren; sonst `JSON.parse(raw)`. `reasoningFromObject` deckt OpenAI (`choices[].message|delta.reasoning_content` bzw. `.reasoning`) und Anthropic (`content[].type==='thinking'.thinking` sowie streaming `type==='content_block_delta'` mit `delta.type==='thinking_delta'`) ab.
- [ ] Helfer `recordReasoning(reqPath, rawBody, startedAt)`: aus `extractReasoningText` die Länge → `reasoning_tokens = Math.round(len/3.5)`; JSONL-Zeile `{ts, path, reasoning_tokens, estimated:true, budget:REASONING_BUDGET, capped:(reasoning_tokens>REASONING_BUDGET), duration_s}` best-effort anhängen (`mkdir` recursive + `appendFile`, Fehler verschluckt — darf das Proxying nie brechen). Kein `/tokenize`-Roundtrip.
- [ ] In `proxyV1`: `startedAt` merken; Fehlerrückgabe von `resolveModel` mappen (`routed.error` → 503 `no_backend` bzw. 404 `unknown_model`); den Response-Stream teen — bis zu `REASONING_CAP_BYTES` (z. B. 4 MiB) puffern und bei `end` `recordReasoning(reqPath, …)` auslösen, dann wie bisher `pipe(res)`. Dazu die volle Request-`path` als zusätzliches Argument an `proxyV1` reichen.
- [ ] Im Router `GET /healthz` (200/503 je nach `healthSummary`) und die `registry`-Anreicherung von `/admin/state` ergänzen; `/health`, `/v1/models`, `/admin/reload`, `/v1/*`-POST unverändert.

```js
import http from 'node:http';
import { Readable } from 'node:stream';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { startRegistryPoll, getBackends, resolveApiKey, getRegistryState } from './backends.mjs';
import { startDiscovery, resolveModel, aggregateModels, getState, healthSummary } from './discovery.mjs';
import { applyFixups } from './fixups.mjs';

const PORT = Number(process.env.LLM_PROXY_PORT || 18235);
const POLL_MS = 30_000;
const REASONING_BUDGET = Number(process.env.REASONING_BUDGET || 8192);
const REASONING_CAP_BYTES = 4 * 1024 * 1024;
const METRICS_PATH = join(homedir(), '.config', 'factory', 'reasoning-metrics.jsonl');

function reasoningFromObject(obj) {
  let out = '';
  for (const ch of obj?.choices || []) {
    const m = ch.message || ch.delta || {};
    if (typeof m.reasoning_content === 'string') out += m.reasoning_content;
    else if (typeof m.reasoning === 'string') out += m.reasoning;
  }
  for (const block of obj?.content || []) {
    if (block?.type === 'thinking' && typeof block.thinking === 'string') out += block.thinking;
  }
  if (obj?.type === 'content_block_delta' && obj.delta?.type === 'thinking_delta') out += obj.delta.thinking || '';
  return out;
}

function extractReasoningText(raw) {
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.includes('\ndata:')) {
    let out = '';
    for (const line of raw.split('\n')) {
      const mm = line.match(/^data:\s*(.*)$/);
      if (!mm) continue;
      const payload = mm[1].trim();
      if (!payload || payload === '[DONE]') continue;
      try { out += reasoningFromObject(JSON.parse(payload)); } catch { /* skip partial */ }
    }
    return out;
  }
  try { return reasoningFromObject(JSON.parse(raw)); } catch { return ''; }
}

async function recordReasoning(reqPath, rawBody, startedAt) {
  const text = extractReasoningText(rawBody);
  if (!text) return;
  const reasoning_tokens = Math.round(text.length / 3.5);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    path: reqPath,
    reasoning_tokens,
    estimated: true,
    budget: REASONING_BUDGET,
    capped: reasoning_tokens > REASONING_BUDGET,
    duration_s: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  }) + '\n';
  try { await mkdir(dirname(METRICS_PATH), { recursive: true }); await appendFile(METRICS_PATH, line); }
  catch { /* best-effort: Metrics dürfen das Proxying nie brechen */ }
}
```

`proxyV1` (Fehler-Mapping + Tee des Response-Streams; Signatur um `reqPath` erweitert):

```js
async function proxyV1(req, res, subpath, reqPath) {
  const startedAt = Date.now();
  const body = await readBody(req);
  const routed = resolveModel(body.model, getBackends);
  if (routed.error) {
    const status = routed.error === 'no_backend' ? 503 : 404;
    const message = routed.error === 'no_backend' ? 'no healthy backend' : `unknown model: ${body.model}`;
    return sendJson(res, status, { error: { code: routed.error, message } });
  }
  const { backend, servedModel, substituted } = routed;
  let upstreamBody = { ...body, model: servedModel };
  upstreamBody = applyFixups(backend.fixups, upstreamBody);

  const headers = { 'content-type': 'application/json' };
  const key = resolveApiKey(backend);
  if (key) headers.authorization = `Bearer ${key}`;

  const upstream = await fetch(`${backend.baseUrl}${subpath}`, {
    method: 'POST', headers, body: JSON.stringify(upstreamBody),
  });

  const passHeaders = { 'x-llm-proxy-backend': backend.name, 'x-llm-proxy-served-model': servedModel };
  for (const h of ['content-type', 'cache-control']) {
    const v = upstream.headers.get(h); if (v) passHeaders[h] = v;
  }
  if (substituted) console.log(`[route] ${body.model} → ${backend.name}:${servedModel}`);
  res.writeHead(upstream.status, passHeaders);
  if (upstream.body) {
    const stream = Readable.fromWeb(upstream.body);
    const chunks = []; let size = 0;
    stream.on('data', (c) => { if (size < REASONING_CAP_BYTES) { chunks.push(c); size += c.length; } });
    stream.on('end', () => { void recordReasoning(reqPath, Buffer.concat(chunks).toString('utf8'), startedAt); });
    stream.pipe(res);
  } else {
    res.end();
  }
}
```

Router-Ausschnitt (neu: `/healthz`; angereichertes `/admin/state`; erweiterter `proxyV1`-Aufruf):

```js
if (path === '/health') return sendJson(res, 200, { status: 'ok' });
if (path === '/healthz' && method === 'GET') {
  const s = healthSummary(getBackends);
  const reg = getRegistryState();
  const status = s.healthy_backends >= 1 ? 200 : 503;
  return sendJson(res, status, {
    healthy_backends: s.healthy_backends,
    total_backends: s.total_backends,
    registry_poll_age_s: reg.pollAgeSeconds,
    degraded: reg.degraded,
  });
}
if (path === '/v1/models' && method === 'GET') return sendJson(res, 200, aggregateModels());
if (path === '/admin/state' && method === 'GET')
  return sendJson(res, 200, { ...getState(getBackends), registry: getRegistryState() });
if (path === '/admin/reload' && method === 'POST') { await discovery.probeNow(); return sendJson(res, 200, { reloaded: true }); }
if (path.startsWith('/v1/') && method === 'POST') return proxyV1(req, res, path.slice(3), path);
return sendJson(res, 404, { error: { code: 'not_found', message: path } });
```

**Verify:**

```bash
node --check scripts/llm-proxy/server.mjs
# erwartet: exit 0
wc -l scripts/llm-proxy/server.mjs
# erwartet: deutlich unter 500 (S1 .mjs-Limit)

# Doku (nach Boot mit erreichbaren Backends, siehe p2 llm:proxy:start):
#   curl -s http://127.0.0.1:18235/healthz | jq
#     → {"healthy_backends":N,"total_backends":M,"registry_poll_age_s":S,"degraded":false}  (200 wenn N>=1, sonst 503)
#   curl -s -X POST http://127.0.0.1:18235/v1/chat/completions -d '{"model":"does-not-exist","messages":[]}'
#     → 404 {"error":{"code":"unknown_model", ...}}   (bei ≥1 gesundem Backend)
```
