# p1-proxy — Proxy-Service & Konsolidierung

Rolle: `impl`. Liefert den repo-verwalteten LLM-Proxy (`scripts/llm-proxy/`, Port 18235),
die Backend-Registry-Migration und die Konsolidierung der Drift-Zeilen +
`route-provider.sh`-Hardcodes. Folgt `design.md` §1 (Proxy-Service), §2 (Routing) und §3
(Migration) verbatim. **Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein**
RED-Failing-Test-Step (lebt in `p3-tests`).

## S1-Zeilenbudgets (wirksame Schwelle je Datei)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/route-provider.sh` | 77 | 423 |
| `scripts/llm-proxy/server.mjs` | 0 | 500 |
| `scripts/llm-proxy/backends.mjs` | 0 | 500 |
| `scripts/llm-proxy/discovery.mjs` | 0 | 500 |
| `scripts/llm-proxy/fixups.mjs` | 0 | 500 |

`.mjs`/`.sh`-Limit ist 500. Alle vier neuen Module bleiben mit Wachstumsreserve darunter; die
Logik ist bereits in vier Module aufgeteilt, damit `server.mjs` strikt unter 500 Zeilen bleibt.
`scripts/migrations/2026-07-22-llm-proxy-backends.sql` unterliegt keinem S1-Limit (Migration).

---

## Task 1: Migration `2026-07-22-llm-proxy-backends.sql` — Registry-Tabelle, Seed & Drift-Korrektur

Muster: `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql` (idempotent, `BEGIN`/`COMMIT`,
Apply-Kommentar für beide Brand-DBs im Header). Backend-Form aus `design.md` §1/§3.

- [ ] Datei `scripts/migrations/2026-07-22-llm-proxy-backends.sql` neu anlegen.
- [ ] Header-Kommentar mit Apply-Zeile für **beide** Brand-Kontexte (`factory_resolve`+`factory_psql`-Muster).
- [ ] `CREATE TABLE IF NOT EXISTS tickets.llm_proxy_backends` mit allen Spalten inkl. `CHECK`-Constraint auf `kind`.
- [ ] Seed der vier Backends via `INSERT … ON CONFLICT (name) DO UPDATE` (idempotent): `llamacpp-bonsai` (prio 1, fixup), `lmstudio` (prio 2), `deepseek` (prio 90, `DEEPSEEK_API_KEY`), `opencode-zen` (prio 91, `OPENCODE_API_KEY`).
- [ ] Drift-`UPDATE` auf `tickets.provider_config` und `tickets.factory_model_slots`: alle `enabled`-Zeilen mit `base_url LIKE 'http://127.0.0.1:%'` → `'http://127.0.0.1:18235'`. Remote-URLs (`api.deepseek.com`) bleiben unberührt.

```sql
-- 2026-07-22-llm-proxy-backends.sql
-- Backend-Registry für den repo-verwalteten LLM-Proxy (Port 18235) + Drift-Korrektur der
-- provider_config/factory_model_slots-Zeilen, die den Fixup-Proxy umgehen (direkt :8093/:1234).
-- Idempotent (CREATE … IF NOT EXISTS, ON CONFLICT DO UPDATE). Reversibel: enabled=false setzen.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-llm-proxy-backends.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-llm-proxy-backends.sql'
BEGIN;

CREATE TABLE IF NOT EXISTS tickets.llm_proxy_backends (
  id            serial PRIMARY KEY,
  name          text UNIQUE NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('llamacpp','lmstudio','openai-remote')),
  base_url      text NOT NULL,
  api_key_env   text,
  enabled       boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 100,
  fixups        jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_aliases jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-bonsai', 'llamacpp',      'http://127.0.0.1:8093/v1',   NULL,               true,  1,  '["bonsai-system-role-fixup"]'::jsonb, '{}'::jsonb),
  ('lmstudio',        'lmstudio',      'http://127.0.0.1:1234/v1',   NULL,               true,  2,  '[]'::jsonb,                           '{}'::jsonb),
  ('deepseek',        'openai-remote', 'https://api.deepseek.com/v1',   'DEEPSEEK_API_KEY', true,  90, '[]'::jsonb,                           '{}'::jsonb),
  ('opencode-zen',    'openai-remote', 'http://127.0.0.1:5099/v1',    'OPENCODE_API_KEY', true,  91, '[]'::jsonb,                           '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      api_key_env   = EXCLUDED.api_key_env,
      priority      = EXCLUDED.priority,
      fixups        = EXCLUDED.fixups,
      updated_at    = now();

-- Drift-Korrektur: enabled-Zeilen, die einen lokalen Backend-Port direkt ansprechen und damit
-- den Fixup-Proxy umgehen, auf den Proxy-Port 18235 biegen. Remote-URLs bleiben unberührt.
UPDATE tickets.provider_config
   SET base_url = 'http://127.0.0.1:18235', updated_at = now()
 WHERE enabled AND base_url LIKE 'http://127.0.0.1:%'
   AND base_url <> 'http://127.0.0.1:18235';

UPDATE tickets.factory_model_slots
   SET base_url = 'http://127.0.0.1:18235'
 WHERE base_url LIKE 'http://127.0.0.1:%'
   AND base_url <> 'http://127.0.0.1:18235';

COMMIT;
```

> Der `opencode-zen`-Port `:5099` ist der lokale Opencode-Go-Endpoint; falls die laufende
> Instanz auf einem anderen Port lauscht, wird der Wert vor Apply gegen `task llm:proxy:status`
> abgeglichen und in dieser Zeile korrigiert — die Spalte `base_url` ist die einzige
> Anlaufstelle dafür.

**Verify:**

```bash
# SQL-Syntax offline gegen die Dev-DB parsen (Transaktion wird zurückgerollt):
BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; \
  printf "BEGIN;\n%s\nROLLBACK;\n" "$(cat scripts/migrations/2026-07-22-llm-proxy-backends.sql)" \
  | factory_psql'
# erwartet: keine ERROR-Zeile (idempotenter Parse-Durchlauf)
```

---

## Task 2: `backends.mjs` — Registry-Loader über `factory_psql`-Subprocess (30s-Poll)

Der Proxy läuft host-lokal; die DB ist nur via `kubectl exec` in den `shared-db`-Pod erreichbar.
Deshalb dasselbe Muster wie `factory_psql` in `scripts/factory/lib.sh` nutzen: SQL über
`bash -c 'source …/lib.sh; factory_resolve; factory_psql'` auf stdin geben, tab-getrennte Zeilen
(`-qtA`) zurücklesen. `BRAND` (Default `mentolder`) wählt die Brand-DB. API-Keys kommen **nie**
aus der DB, sondern aus der in `api_key_env` benannten Env-Variable.

- [ ] Datei `scripts/llm-proxy/backends.mjs` neu anlegen.
- [ ] `loadBackendsOnce()`: `execFileSync('bash', ['-c', script])` mit SQL auf stdin, parst Zeilen zu `Backend`-Objekten; `fixups`/`model_aliases` via `JSON.parse`.
- [ ] `startRegistryPoll(intervalMs, onUpdate)`: `setInterval`; bei DB-Fehler letzten bekannten Stand behalten + Warnung loggen (kein Crash — `design.md` §Fehlerbehandlung).
- [ ] `getBackends()`: liefert gecachtes Array; `resolveApiKey(backend)`: liest `process.env[backend.apiKeyEnv]` (oder `null`).

```js
// scripts/llm-proxy/backends.mjs
import { execFileSync } from 'node:child_process';

/** @typedef {{ name:string, kind:'llamacpp'|'lmstudio'|'openai-remote',
 *   baseUrl:string, apiKeyEnv:string|null, enabled:boolean, priority:number,
 *   fixups:string[], modelAliases:Record<string,string> }} Backend */

const SQL = `SELECT name||E'\\t'||kind||E'\\t'||base_url||E'\\t'||COALESCE(api_key_env,'')
  ||E'\\t'||enabled||E'\\t'||priority||E'\\t'||fixups::text||E'\\t'||model_aliases::text
  FROM tickets.llm_proxy_backends WHERE enabled ORDER BY priority ASC;`;

/** @returns {Backend[]} */
export function loadBackendsOnce() {
  const script = 'source scripts/factory/lib.sh; factory_resolve; factory_psql';
  const out = execFileSync('bash', ['-c', script], {
    input: SQL, encoding: 'utf8',
    env: { ...process.env, BRAND: process.env.BRAND || 'mentolder' },
  });
  return out.split('\n').filter(Boolean).map((line) => {
    const [name, kind, baseUrl, apiKeyEnv, enabled, priority, fixups, aliases] = line.split('\t');
    return {
      name, kind, baseUrl,
      apiKeyEnv: apiKeyEnv || null,
      enabled: enabled === 't',
      priority: Number(priority),
      fixups: JSON.parse(fixups || '[]'),
      modelAliases: JSON.parse(aliases || '{}'),
    };
  });
}

let cache = [];
export function getBackends() { return cache; }
export function resolveApiKey(backend) {
  return backend.apiKeyEnv ? (process.env[backend.apiKeyEnv] || null) : null;
}

export function startRegistryPoll(intervalMs, onUpdate) {
  const tick = () => {
    try { cache = loadBackendsOnce(); onUpdate?.(cache); }
    catch (err) { console.warn('[backends] registry poll failed, keeping last state:', err.message); }
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
# erwartet: exit 0 (keine Syntaxfehler)
```

---

## Task 3: `discovery.mjs` — `/v1/models`-Probe, Health/Backoff, Routing-Katalog

Probt je Backend 30s + on-demand `GET <baseUrl>/models`; für `kind=lmstudio` zusätzlich
`GET <host>/api/v0/models` (liefert `loaded`-Status). Hält In-Memory-Katalog
`modelId → [backends nach Priorität]`. Fehlprobe → Backend `unhealthy` mit Backoff, **kein**
Hard-Remove. Antwort-Shape OpenAI: `{ object:'list', data:[{ id, object:'model', … }] }`.

- [ ] Datei `scripts/llm-proxy/discovery.mjs` neu anlegen.
- [ ] `probeBackend(backend)`: `fetch` mit kurzem Timeout (`AbortSignal.timeout`); bei `lmstudio` zusätzlich `/api/v0/models` für `loaded`-Set; Rückgabe `{ healthy, models, loaded }`.
- [ ] `startDiscovery(getBackends, intervalMs)`: pollt alle Backends, aktualisiert `catalog` + `health` (mit `backoffUntil` bei Fehler).
- [ ] `resolveModel(requestedId, getBackends)`: exakte ID → `modelAliases`-Treffer → Verfügbarkeits-Fallback (erstes Modell des höchstprioren gesunden Backends) → `null`. Rückgabe `{ backend, servedModel, substituted }`.
- [ ] `getState()`: aggregierter Status (Backends, Health, entdeckte Modelle, letzte Probe) für `/admin/state`; `aggregateModels()`: `/v1/models`-Aggregat.

```js
// scripts/llm-proxy/discovery.mjs
const PROBE_TIMEOUT_MS = 2500;
const BACKOFF_MS = 15_000;

/** @type {Map<string,{healthy:boolean,models:string[],loaded:Set<string>,backoffUntil:number,lastProbe:number}>} */
const health = new Map();
/** @type {Map<string,string[]>} catalog: modelId → backend names by priority */
let catalog = new Map();
let lastProbeAt = 0;

/** @returns {Promise<{healthy:boolean,models:string[],loaded:Set<string>}>} */
export async function probeBackend(backend) {
  try {
    const res = await fetch(`${backend.baseUrl}/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const models = (body.data || []).map((m) => m.id);
    const loaded = new Set();
    if (backend.kind === 'lmstudio') {
      const host = backend.baseUrl.replace(/\/v1\/?$/, '');
      const v0 = await fetch(`${host}/api/v0/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then((r) => r.json()).catch(() => null);
      for (const m of (v0?.data || [])) if (m.state === 'loaded') loaded.add(m.id);
    }
    return { healthy: true, models, loaded };
  } catch {
    return { healthy: false, models: [], loaded: new Set() };
  }
}

export function startDiscovery(getBackends, intervalMs) {
  const tick = async () => {
    const next = new Map();
    for (const b of getBackends()) {
      const prev = health.get(b.name);
      if (prev && !prev.healthy && Date.now() < prev.backoffUntil) { health.set(b.name, prev); continue; }
      const r = await probeBackend(b);
      health.set(b.name, { ...r, backoffUntil: r.healthy ? 0 : Date.now() + BACKOFF_MS, lastProbe: Date.now() });
      for (const id of r.models) { if (!next.has(id)) next.set(id, []); next.get(id).push(b.name); }
    }
    catalog = next;
    lastProbeAt = Date.now();
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
  return { timer: t, probeNow: tick };
}

/** @returns {{backend:import('./backends.mjs').Backend, servedModel:string, substituted:boolean}|null} */
export function resolveModel(requestedId, getBackends) {
  const backends = getBackends();
  const byName = (n) => backends.find((b) => b.name === n);
  const healthyNames = (id) => (catalog.get(id) || []).filter((n) => health.get(n)?.healthy);

  const exact = healthyNames(requestedId);
  if (exact.length) return { backend: byName(exact[0]), servedModel: requestedId, substituted: false };

  for (const b of backends) {
    const aliased = b.modelAliases[requestedId];
    if (aliased && healthyNames(aliased).includes(b.name) && health.get(b.name)?.healthy) {
      return { backend: b, servedModel: aliased, substituted: true };
    }
  }

  for (const b of backends) {
    const h = health.get(b.name);
    if (h?.healthy && h.models.length) return { backend: b, servedModel: h.models[0], substituted: true };
  }
  return null;
}

export function aggregateModels() {
  const data = [];
  for (const id of catalog.keys()) if ((catalog.get(id) || []).some((n) => health.get(n)?.healthy)) {
    data.push({ id, object: 'model', owned_by: 'llm-proxy' });
  }
  return { object: 'list', data };
}

export function getState(getBackends) {
  return {
    lastProbe: lastProbeAt,
    backends: getBackends().map((b) => {
      const h = health.get(b.name);
      return { name: b.name, kind: b.kind, baseUrl: b.baseUrl, priority: b.priority,
        healthy: !!h?.healthy, models: h?.models || [], loaded: [...(h?.loaded || [])] };
    }),
  };
}
```

**Verify:**

```bash
node --check scripts/llm-proxy/discovery.mjs
# erwartet: exit 0
```

---

## Task 4: `fixups.mjs` — benannte Request-Transformationen (`bonsai-system-role-fixup`)

Benannte, im Proxy implementierte Transformationen; Backend-Zeilen referenzieren sie über die
`fixups`-jsonb-Liste. Initial nur `bonsai-system-role-fixup`: `role:"system"`-Nachrichten, die
**mitten** im `messages`-Array stehen (also nicht als erste Nachricht), werden in
`role:"user"` mit vorangestelltem Marker umgeschrieben — das umgeht den bekannten Mid-Array-Bug
des Bonsai-Servers `:8093`.

- [ ] Datei `scripts/llm-proxy/fixups.mjs` neu anlegen.
- [ ] `FIXUPS`-Registry `{ name → (body) => body }`; unbekannte Namen no-op mit Warnung.
- [ ] `applyFixups(names, body)`: wendet die benannten Transformationen der Reihe nach an; arbeitet auf einer flachen Kopie, mutiert das Original nicht.
- [ ] Im Kopf-Kommentar dokumentieren: **das exakte Verhalten des Fixups muss vor Abschaltung des Alt-Proxys gegen dessen laufende Instanz auf `:18235` verifiziert werden** (Referenz-Memo `reference_ternary-bonsai-27b-test-server`), da der Alt-Proxy nicht versioniert ist.

```js
// scripts/llm-proxy/fixups.mjs
// Benannte Request-Fixups. WICHTIG: Vor dem Abschalten des nicht-versionierten Alt-Proxys auf
// :18235 muss das exakte Umschreibe-Verhalten von bonsai-system-role-fixup gegen dessen laufende
// Instanz abgeglichen werden (Memo reference_ternary-bonsai-27b-test-server) — dieser Nachbau
// ist die zu verifizierende Referenz-Implementierung, nicht die bestätigte Quelle der Wahrheit.
const SYSTEM_MARKER = '[system]';

function bonsaiSystemRoleFixup(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((msg, i) => {
    if (i > 0 && msg.role === 'system') {
      return { ...msg, role: 'user', content: `${SYSTEM_MARKER} ${msg.content}` };
    }
    return msg;
  });
  return { ...body, messages };
}

export const FIXUPS = {
  'bonsai-system-role-fixup': bonsaiSystemRoleFixup,
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
node -e "import('./scripts/llm-proxy/fixups.mjs').then(m => { \
  const r = m.applyFixups(['bonsai-system-role-fixup'], \
    { messages:[{role:'system',content:'a'},{role:'user',content:'b'},{role:'system',content:'c'}] }); \
  console.log(JSON.stringify(r.messages.map(x=>x.role))); })"
# erwartet: ["system","user","user"]  (nur die Mid-Array-system-Nachricht wird user)
```

---

## Task 5: `server.mjs` — HTTP-Server, Routing, Endpunkte, SSE-Byte-Pipe

`node:http`-Server auf `LLM_PROXY_PORT` (Default **18235**). Bindet die Module aus Task 2–4.
Strikt unter 500 Zeilen halten (Logik lebt in den Modulen). Endpunkte laut `design.md` §1:
`POST /v1/chat/completions` + `/v1/*`-Pass-through inkl. SSE-Byte-Pipe, `GET /v1/models`,
`GET /admin/state`, `POST /admin/reload`, `GET /health`.

- [ ] Datei `scripts/llm-proxy/server.mjs` neu anlegen; `startRegistryPoll(30000, …)` + `startDiscovery(getBackends, 30000)` beim Boot.
- [ ] `POST /v1/chat/completions` und weitere `/v1/*`: Body lesen, Modell-ID via `resolveModel` auflösen; kein Treffer → `503 {error:{code:'no_backend'}}`.
- [ ] Fixups des Ziel-Backends via `applyFixups` anwenden; `servedModel` in den Upstream-Body schreiben; `Authorization: Bearer <resolveApiKey>` setzen, falls Backend einen Key-Env nennt.
- [ ] Upstream-Antwort transparent durchreichen; Response-Body als Byte-Pipe streamen (deckt SSE ab); Header `x-llm-proxy-backend` und `x-llm-proxy-served-model` setzen.
- [ ] `GET /v1/models` → `aggregateModels()`; `GET /admin/state` → `getState`; `POST /admin/reload` → Registry + Discovery sofort neu laden; `GET /health` → `200`.

```js
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

async function proxyV1(req, res, subpath) {
  const body = await readBody(req);
  const routed = resolveModel(body.model, getBackends);
  if (!routed) return sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });

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
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);  // SSE-Byte-Pipe
  else res.end();
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

server.listen(PORT, '127.0.0.1', () => console.log(`[llm-proxy] listening on 127.0.0.1:${PORT}`));
```

**Verify:**

```bash
node --check scripts/llm-proxy/server.mjs
wc -l scripts/llm-proxy/server.mjs   # muss < 500 bleiben (S1-Limit .mjs)
# erwartet: node --check exit 0; Zeilenzahl deutlich unter 500
```

---

## Task 6: `route-provider.sh` — Opus-Hardcode auf Bonsai @ `:18235` (Budget 423)

`route-provider.sh` trägt in Z.22–23 den Opus-/Emergency-Hardcode `qwythos-9b-v2`@`:1234`.
Laut `design.md` §3 wird der Opus-Pfad auf `ternary-bonsai-27b`@`http://127.0.0.1:18235`
gebogen. Datei ist nicht baselined → wirksames Budget 423 (weit ausreichend, reine Wertänderung).

- [ ] `OPUS_MODEL="qwythos-9b-v2"` → `OPUS_MODEL="ternary-bonsai-27b"`.
- [ ] `OPUS_BASE_URL="http://127.0.0.1:1234"` → `OPUS_BASE_URL="http://127.0.0.1:18235"`.
- [ ] `provider`-Feld im Opus-`printf` bleibt konsistent (kein LM-Studio-spezifischer Provider-String mehr nötig; Proxy ist provider-agnostisch — auf `ternary-bonsai-27b` setzen).

```bash
OPUS_MODEL="ternary-bonsai-27b"
OPUS_BASE_URL="http://127.0.0.1:18235"
if [[ "$TIER" == "opus" ]]; then
  printf '{"provider":"ternary-bonsai-27b","modelId":"%s","baseUrl":"%s","slotId":null,"ctx":0,"emergency":false}\n' "$OPUS_MODEL" "$OPUS_BASE_URL"
  exit 0
fi
```

**Verify:**

```bash
bash -n scripts/factory/route-provider.sh
bash scripts/factory/route-provider.sh factory-implement opus | jq -r .baseUrl
# erwartet: http://127.0.0.1:18235
```

---

## Task 7: `Taskfile.llm.yml` — Prozess-Management `llm:proxy:start|stop|status|logs`

Muster: bestehende `llm:`-Tasks (`bootstrap-host`, `status`) + nohup/PID-File unter
`~/.local/state/llm-proxy/` (gleiches Muster wie die anderen host-lokalen `llm:`-Skripte).
`start` bootet `scripts/llm-proxy/server.mjs` detached; `stop` killt via PID-File; `status`
prüft `GET /health` + `GET /admin/state`; `logs` `tail`t die Logdatei.

- [ ] Vier Tasks `proxy:start`, `proxy:stop`, `proxy:status`, `proxy:logs` unter dem bestehenden `tasks:`-Block ergänzen.
- [ ] `proxy:start`: `mkdir -p ~/.local/state/llm-proxy`; wenn PID-File auf lebenden Prozess zeigt → Hinweis + exit 0 (idempotent); sonst `nohup node scripts/llm-proxy/server.mjs` mit PID- und Log-File.
- [ ] `proxy:stop`: PID aus Datei lesen, `kill`, PID-File entfernen.
- [ ] `proxy:status`: `curl -fsS http://127.0.0.1:${LLM_PROXY_PORT:-18235}/health` + `/admin/state | jq`; offline-toleranter Hinweis „Start: task llm:proxy:start".

```yaml
  proxy:start:
    desc: "Start the local LLM proxy (scripts/llm-proxy, Port 18235) detached with PID/log file"
    cmds:
      - |
        set -e
        DIR="$HOME/.local/state/llm-proxy"; mkdir -p "$DIR"
        PIDF="$DIR/proxy.pid"; LOGF="$DIR/proxy.log"
        if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
          echo "llm-proxy already running (pid $(cat "$PIDF"))"; exit 0
        fi
        nohup node scripts/llm-proxy/server.mjs >> "$LOGF" 2>&1 &
        echo $! > "$PIDF"
        echo "✓ llm-proxy started (pid $(cat "$PIDF"), log $LOGF)"

  proxy:stop:
    desc: "Stop the local LLM proxy via PID file"
    cmds:
      - |
        PIDF="$HOME/.local/state/llm-proxy/proxy.pid"
        [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null && rm -f "$PIDF" && echo "✓ stopped" || echo "not running"

  proxy:status:
    desc: "Show LLM proxy health + discovered backends/models"
    cmds:
      - |
        PORT="${LLM_PROXY_PORT:-18235}"
        curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 \
          && curl -fsS "http://127.0.0.1:$PORT/admin/state" | jq . \
          || echo "llm-proxy offline — Start: task llm:proxy:start"

  proxy:logs:
    desc: "Tail the local LLM proxy log"
    cmds:
      - tail -n 100 -f "$HOME/.local/state/llm-proxy/proxy.log"
```

**Verify:**

```bash
task --list 2>/dev/null | grep -E 'llm:proxy:(start|stop|status|logs)'
# erwartet: alle vier Tasks gelistet
task -n llm:proxy:status
# erwartet: Dry-Run zeigt den curl-Befehl ohne Fehler
```

---

## Task 8: Rollout — Alt-Proxy stoppen, neuen Proxy starten, Migration, Smoke

Reihenfolge laut `design.md` §Rollout-Hinweis. Der nicht-versionierte Ad-hoc-Fixup-Proxy hält
`:18235` — er muss **vor** `task llm:proxy:start` gestoppt werden, sonst schlägt das Port-Binding
fehl. Danach Migration gegen beide Brand-DBs, dann `route-provider.sh`-Smoke.

- [ ] Alt-Proxy auf `:18235` ermitteln (`ss -ltnp | grep 18235` bzw. Windows-Listener) und beenden.
- [ ] `task llm:proxy:start` — neuen Proxy binden; `task llm:proxy:status` bestätigt Health + Backends.
- [ ] Migration gegen **beide** Brand-DBs anwenden (mentolder + korczewski, s. Task-1-Header).
- [ ] `route-provider.sh`-Smoke: Opus-Pfad und ein Factory-Phase-Pfad liefern `:18235`.

```bash
# 1. Alt-Proxy freigeben (Host-Port ermitteln, dann beenden):
ss -ltnp 2>/dev/null | grep ':18235' || /mnt/c/Windows/System32/netstat.exe -ano | grep 18235 || true
# 2. Neuen Proxy starten + prüfen:
task llm:proxy:start && task llm:proxy:status
# 3. Migration beide Brands:
for b in mentolder korczewski; do
  BRAND="$b" bash -c 'source scripts/factory/lib.sh; factory_resolve; \
    factory_psql < scripts/migrations/2026-07-22-llm-proxy-backends.sql'
done
# 4. route-provider-Smoke (erwartet :18235):
bash scripts/factory/route-provider.sh factory-implement opus | jq -r .baseUrl
```

**Verify:**

```bash
bash scripts/factory/route-provider.sh factory-implement opus | jq -r .baseUrl
# erwartet: http://127.0.0.1:18235
curl -fsS "http://127.0.0.1:${LLM_PROXY_PORT:-18235}/health" | jq -r .status
# erwartet: ok
```
