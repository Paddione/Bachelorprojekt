# p3-tests — RED-Tests für Proxy, Discovery & GUI-API

Rolle: `tests`. Dieses Partial legt die **RED-Tests** an, die exakt die vier Requirements aus
`openspec/changes/local-llm-proxy/specs/local-llm-proxy.md` abdecken. Die Tests werden hier
**absichtlich rot** committet (Implementierung existiert erst nach p1/p2). Es werden ausschließlich
Testdateien und das regenerierte Test-Inventar angefasst — D1-disjunkt zu allen anderen Partials.

## File Structure

| Datei | Status | Budget |
|---|---|---|
| `tests/spec/local-llm-proxy.bats` | neu | — (`.bats`, klein halten) |
| `scripts/llm-proxy/server.test.mjs` | neu | 500 (`.mjs`-Limit) |
| `website/src/lib/llm-proxy-db.test.ts` | neu | 600 (`.ts`-Limit) |
| `website/src/pages/api/admin/llm-proxy/status.test.ts` | neu | 600 (`.ts`-Limit) |
| `website/src/data/test-inventory.json` | regeneriert (generiertes Artefakt) | — |

Testrunner-Pfade im Repo (verifiziert):
- BATS: `tests/unit/lib/bats-core/bin/bats <file>`
- Scripts-Node-Tests: `node --test <file>.mjs` (Muster: `scripts/factory/provision.test.mjs`)
- Website-Vitest: `cd website && pnpm vitest run <relpfad>`

Abbildung Requirement → Test (Nachweispflicht):

| Requirement (Szenario) | Testdatei |
|---|---|
| Proxy as sole LLM gateway — Client-Request geroutet | `local-llm-proxy.bats` + `server.test.mjs` |
| Proxy as sole LLM gateway — Konfiguration zeigt auf Proxy (`route-provider.sh`) | `local-llm-proxy.bats` |
| Dynamic model discovery — Stale-ID-Fallback | `local-llm-proxy.bats` + `server.test.mjs` |
| Dynamic model discovery — kein Backend → 503 `no_backend` | `local-llm-proxy.bats` |
| Backend registry & admin API — Status tolerant bei offline Proxy | `status.test.ts` |
| Backend registry & admin API — CRUD-Whitelist/Löschschutz | `llm-proxy-db.test.ts` |

## Task 1: BATS-Suite `tests/spec/local-llm-proxy.bats` (RED-Anker + STRUCT2)

- [ ] Datei `tests/spec/local-llm-proxy.bats` neu anlegen. Konvention: **ein `.bats` pro
      SSOT-Spec** — `local-llm-proxy` ist der Spec-Slug; **keine** ticket-nummerierte Datei.
      Header + `load 'test_helper.bash'` wie in `tests/spec/software-factory.bats`.
- [ ] Zwei Mock-Backends als node-Einzeiler-Stubs im `setup()` starten (OpenAI-kompatibel:
      `GET /v1/models` liefert `{object:'list',data:[…]}`, `POST /v1/chat/completions` echot das
      empfangene `model` + das eigene Label). Ports über `:0`/ephemeral binden, PID + gewählten
      Port in Testvariablen halten, in `teardown()` killen. Backend A bietet `m1`, Backend B
      bietet `m2`.
- [ ] Proxy gegen die beiden Stubs starten (`scripts/llm-proxy/server.mjs`, Registry-Override
      per Env/Testfixture auf die beiden Stub-URLs; `LLM_PROXY_PORT` ephemeral). Warten bis
      `GET /health` 200 liefert.

Test-Skelett:

```bash
#!/usr/bin/env bats
# tests/spec/local-llm-proxy.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Konvention: eine .bats-Datei pro OpenSpec-SSOT-Spec.

PROXY_MOD="scripts/llm-proxy/server.mjs"
ROUTE="scripts/factory/route-provider.sh"

# Minimaler OpenAI-kompatibler Stub: $1=port $2=label $3=modelId
_start_stub() {
  local port="$1" label="$2" model="$3"
  node -e '
    const [port,label,model]=process.argv.slice(1);
    require("http").createServer((req,res)=>{
      let b=""; req.on("data",c=>b+=c); req.on("end",()=>{
        res.setHeader("content-type","application/json");
        if(req.url.startsWith("/v1/models"))
          return res.end(JSON.stringify({object:"list",data:[{id:model,object:"model"}]}));
        if(req.url.startsWith("/v1/chat/completions")){
          const m=(JSON.parse(b||"{}").model)||null;
          return res.end(JSON.stringify({backend:label,served:model,requested:m,
            choices:[{message:{role:"assistant",content:"ok"}}]}));
        }
        res.statusCode=404; res.end("{}");
      });
    }).listen(Number(port),"127.0.0.1");
  ' "$port" "$label" "$model" &
  echo $!
}

_free_port() { node -e 'const s=require("net").createServer();s.listen(0,()=>{console.log(s.address().port);s.close();})'; }

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  PORT_A="$(_free_port)"; PORT_B="$(_free_port)"; PROXY_PORT="$(_free_port)"
  PID_A="$(_start_stub "$PORT_A" backendA m1)"
  PID_B="$(_start_stub "$PORT_B" backendB m2)"
  # Registry-Override: der Proxy liest im Testmodus die Backends aus LLM_PROXY_BACKENDS_JSON
  # statt aus der DB (fail-closed auf DB, wenn Env fehlt — im Test immer gesetzt).
  export LLM_PROXY_PORT="$PROXY_PORT"
  export LLM_PROXY_BACKENDS_JSON="[
    {\"name\":\"a\",\"kind\":\"llamacpp\",\"baseUrl\":\"http://127.0.0.1:${PORT_A}/v1\",\"enabled\":true,\"priority\":1,\"fixups\":[],\"modelAliases\":{}},
    {\"name\":\"b\",\"kind\":\"lmstudio\",\"baseUrl\":\"http://127.0.0.1:${PORT_B}/v1\",\"enabled\":true,\"priority\":2,\"fixups\":[],\"modelAliases\":{}}]"
  PROXY_PID=""
}

teardown() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  kill "$PID_A" "$PID_B" 2>/dev/null || true
}

_start_proxy() {
  node "${REPO_ROOT}/${PROXY_MOD}" & PROXY_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}
```

- [ ] `@test` — Aggregiertes `GET /v1/models` listet beide Backend-Modelle
      (Requirement *Dynamic model discovery*, aggregierte Live-Liste).

```bash
@test "GET /v1/models aggregiert beide Backends (m1 + m2)" {
  _start_proxy
  run curl -sf "http://127.0.0.1:${PROXY_PORT}/v1/models"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"m1"'
  echo "$output" | grep -q '"m2"'
}
```

- [ ] `@test` — Exakte Modell-ID landet auf dem richtigen Backend
      (Requirement *Proxy as sole LLM gateway*, `x-llm-proxy-backend`-Header).

```bash
@test "Routing: exakte ID m2 -> Backend b via x-llm-proxy-backend" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"m2","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'x-llm-proxy-backend: b'
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m2'
}
```

- [ ] `@test` — Stale Modell-ID fällt auf verfügbares Modell zurück
      (Requirement *Dynamic model discovery*, Szenario *Stale model ID falls back*).

```bash
@test "Stale ID -> Verfuegbarkeits-Fallback + x-llm-proxy-served-model" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"does-not-exist","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  # hoechstpriores gesundes Backend ist a (prio 1) -> m1
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m1'
}
```

- [ ] `@test` — Alle Backends down → strukturiertes 503 `no_backend`
      (Requirement *Dynamic model discovery*, Szenario *No backend available*).

```bash
@test "Alle Backends down -> 503 mit error.code no_backend" {
  kill "$PID_A" "$PID_B" 2>/dev/null; sleep 0.3
  _start_proxy
  run curl -s -o /tmp/llmproxy_body -w '%{http_code}' \
    -H 'content-type: application/json' -d '{"model":"m1","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$output" = "503" ]
  grep -q '"no_backend"' /tmp/llmproxy_body
}
```

- [ ] `@test` — `route-provider.sh factory-implement sonnet` liefert baseUrl `:18235`
      (Requirement *Proxy as sole LLM gateway*, Szenario *Consolidated configuration*). **RED
      solange p1 (Migration + `route-provider.sh`-Repoint) nicht implementiert ist.** Braucht DB
      → mit `_skip_if_no_db`-Guard nach dem Muster aus `tests/spec/software-factory.bats`.

```bash
@test "route-provider.sh factory-implement sonnet -> baseUrl :18235 (kein :8093)" {
  _skip_if_no_db
  run bash "${REPO_ROOT}/${ROUTE}" factory-implement sonnet
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"baseUrl":"http://127.0.0.1:18235"'
  ! echo "$output" | grep -q ':8093'
}
```

- [ ] **Failing-Test-Step (STRUCT2 RED).** Suite ausführen — sie ist rot, weil
      `scripts/llm-proxy/server.mjs` noch nicht existiert (Proxy-Start scheitert in `_start_proxy`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
# expected: FAIL (RED — der Proxy-Service existiert noch nicht; _start_proxy timeoutet)
```

## Task 2: `scripts/llm-proxy/server.test.mjs` — Routing-/Fixup-Unit-Tests (node:test)

- [ ] Datei `scripts/llm-proxy/server.test.mjs` neu anlegen. Muster: `node:test` + `node:assert`
      wie `scripts/factory/provision.test.mjs` (Header-Kommentar mit `Run: node --test …`, pure
      Funktionen, keine I/O). Importiert die Entscheidungs-Helfer aus dem Proxy-Modul
      (z. B. `scripts/llm-proxy/discovery.mjs` / `server.mjs`): `resolveBackend(catalog, model)`
      und `applyFixups(fixups, body)`.
- [ ] Test — Routing-Entscheidung: exakter Treffer wählt das höchstpriore gesunde Backend,
      Alias-Map greift vor dem Fallback, unbekannte ID → Verfügbarkeits-Fallback auf erstes
      Modell des höchstprioren gesunden Backends. Substitution über Rückgabefeld sichtbar.

```js
// scripts/llm-proxy/server.test.mjs
// Pure-function tests for proxy routing + request fixups. Zero deps, zero I/O.
// Run: node --test scripts/llm-proxy/server.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveBackend } from './discovery.mjs'
import { applyFixups } from './server.mjs'

// catalog: gesunde Backends nach Priorität, jeweils mit angebotenen Modellen + Aliases
const catalog = {
  backends: [
    { name: 'a', priority: 1, healthy: true, models: ['m1'], aliases: { sonnet: 'm1' } },
    { name: 'b', priority: 2, healthy: true, models: ['m2'], aliases: {} },
  ],
}

test('resolveBackend: exakte ID -> anbietendes Backend, served == angefragt', () => {
  const r = resolveBackend(catalog, 'm2')
  assert.equal(r.backend, 'b')
  assert.equal(r.servedModel, 'm2')
  assert.equal(r.substituted, false)
})

test('resolveBackend: Alias -> Zielmodell des höchstprioren Backends', () => {
  const r = resolveBackend(catalog, 'sonnet')
  assert.equal(r.backend, 'a')
  assert.equal(r.servedModel, 'm1')
})

test('resolveBackend: stale ID -> Fallback auf erstes Modell des höchstprioren Backends', () => {
  const r = resolveBackend(catalog, 'ghost')
  assert.equal(r.backend, 'a')
  assert.equal(r.servedModel, 'm1')
  assert.equal(r.substituted, true)
})

test('resolveBackend: kein gesundes Backend -> null (Aufrufer sendet 503 no_backend)', () => {
  const r = resolveBackend({ backends: [] }, 'm1')
  assert.equal(r, null)
})
```

- [ ] Test — `bonsai-system-role-fixup`: ein `role:"system"` mitten im `messages`-Array
      (nicht an Position 0) wird durch den Fixup transformiert (Bonsai-Server-Bug aus
      `reference_ternary-bonsai-27b-test-server`); ein `role:"system"` an Position 0 bleibt
      unverändert; ohne den Fixup-Namen wird der Body nicht angefasst (Idempotenz).

```js
test('applyFixups bonsai-system-role-fixup: system mid-array wird transformiert', () => {
  const body = { messages: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'system', content: 'mid' },   // <- der problematische Fall
  ] }
  const out = applyFixups(['bonsai-system-role-fixup'], body)
  // erstes system bleibt, mid-array system ist nicht mehr role:system
  assert.equal(out.messages[0].role, 'system')
  assert.notEqual(out.messages[2].role, 'system')
})

test('applyFixups: leere Fixup-Liste laesst den Body unveraendert (deep equal)', () => {
  const body = { messages: [{ role: 'system', content: 'x' }, { role: 'system', content: 'y' }] }
  assert.deepEqual(applyFixups([], body), body)
})
```

- [ ] Test — Header-Setzung: der Proxy-Helfer, der die Antwort-Header baut, setzt
      `x-llm-proxy-backend` und `x-llm-proxy-served-model` aus dem `resolveBackend`-Ergebnis.
- [ ] Ausführen:

```bash
node --test scripts/llm-proxy/server.test.mjs
# expected: FAIL (RED — scripts/llm-proxy/{server,discovery}.mjs existieren noch nicht)
```

## Task 3: `website/src/lib/llm-proxy-db.test.ts` — CRUD-Whitelist + Löschschutz (Vitest)

- [ ] Datei `website/src/lib/llm-proxy-db.test.ts` neu anlegen. Mock-Muster wie
      `website/src/lib/ki-config-db.test.ts`: `pool.query` über `vi.mock('./website-db', …)`
      hoisted mocken, dann aus `./llm-proxy-db` importieren.
- [ ] Test — `kind`-Enum-Whitelist: `createBackend` akzeptiert nur
      `llamacpp|lmstudio|openai-remote`; ein fremder `kind` wird abgelehnt (kein `query`-Call).
- [ ] Test — `fixups`-Enum-Whitelist: nur bekannte Fixup-Namen (initial
      `bonsai-system-role-fixup`) sind erlaubt; unbekannte Fixups → Reject.
- [ ] Test — `api_key`-Härtung: Schreibpfade persistieren nur `api_key_env` (Env-Name), niemals
      ein Klartext-Key-Feld (SQL enthält `api_key_env`, nicht `api_key`).
- [ ] Test — Löschschutz: `deleteBackend` verweigert das Löschen des **letzten enabled lokalen**
      Backends (analog `deleteProvider`-Schutz); die Zählung schließt die zu löschende Zeile aus.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { createBackend, deleteBackend, LLM_PROXY_KINDS, LLM_PROXY_FIXUPS } from './llm-proxy-db';

beforeEach(() => query.mockReset());

describe('llm-proxy-db CRUD-Whitelist', () => {
  it('kind-Enum enthält genau die drei erlaubten Werte', () => {
    expect([...LLM_PROXY_KINDS].sort()).toEqual(['llamacpp', 'lmstudio', 'openai-remote']);
  });

  it('createBackend lehnt unbekannten kind ab (kein DB-Write)', async () => {
    await expect(createBackend({
      name: 'x', kind: 'evil-kind' as never, base_url: 'http://127.0.0.1:9/v1',
      api_key_env: null, enabled: true, priority: 5, fixups: [], model_aliases: {},
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('createBackend lehnt unbekannten Fixup ab', async () => {
    await expect(createBackend({
      name: 'x', kind: 'llamacpp', base_url: 'http://127.0.0.1:8093/v1',
      api_key_env: null, enabled: true, priority: 1, fixups: ['nope-fixup'] as never, model_aliases: {},
    })).rejects.toThrow();
  });

  it('createBackend persistiert api_key_env, niemals api_key (Klartext)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    await createBackend({
      name: 'deepseek', kind: 'openai-remote', base_url: 'https://api.deepseek.com/v1',
      api_key_env: 'DEEPSEEK_API_KEY', enabled: true, priority: 90,
      fixups: [], model_aliases: {},
    });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/api_key_env/);
    expect(sql).not.toMatch(/\bapi_key\b(?!_env)/);
  });

  it('deleteBackend schützt das letzte enabled lokale Backend', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '0' }] }); // 0 weitere enabled lokale Backends
    await expect(deleteBackend(1)).rejects.toThrow(/letzt|last/i);
    // Count-Query schließt die zu löschende id aus
    expect(query.mock.calls[0][1]).toContain(1);
  });

  it('deleteBackend erlaubt Löschen, wenn ein weiteres lokales Backend enabled bleibt', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }); // 1 weiteres bleibt
    query.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteBackend(2)).resolves.toBeUndefined();
  });
});
```

- [ ] **Failing-Test-Step (RED).** Ausführen:

```bash
cd website && pnpm vitest run src/lib/llm-proxy-db.test.ts
# expected: FAIL (RED — website/src/lib/llm-proxy-db.ts existiert noch nicht)
```

## Task 4: `website/src/pages/api/admin/llm-proxy/status.test.ts` — Offline-Toleranz (Vitest)

- [ ] Datei `website/src/pages/api/admin/llm-proxy/status.test.ts` neu anlegen. Muster:
      `website/src/pages/api/factory-floor/ci.test.ts` (auth mocken, `GET`-Handler direkt
      aufrufen). Zusätzlich `global.fetch` mocken, um den Proxy-Upstream zu simulieren, und den
      DB-Layer `../../../../lib/llm-proxy-db` (`listBackends`).
- [ ] Test — 401 ohne Admin-Session (Guard wie `/api/admin/ki/providers`).
- [ ] Test — Proxy erreichbar → 200 mit `proxy` aus dem Upstream-`/admin/state`.
- [ ] Test — **Proxy nicht erreichbar** (fetch wirft / timeoutet) → **200** mit
      `proxy: 'offline'` und der Backend-Liste aus der DB (Requirement *Backend registry and
      admin API*, Szenario *Status endpoint tolerates offline proxy*). Kein 500.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => (c === 'admin' ? { groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));
const listBackends = vi.fn();
vi.mock('../../../../lib/llm-proxy-db', () => ({ listBackends: (...a: unknown[]) => listBackends(...a) }));

import { GET } from './status';

const req = (c: string | null) =>
  new Request('http://x/api/admin/llm-proxy/status', { headers: c ? { cookie: c } : {} });
const call = (c: string | null) => GET({ request: req(c) } as unknown as Parameters<typeof GET>[0]);

beforeEach(() => { listBackends.mockReset(); vi.restoreAllMocks(); });

describe('GET /api/admin/llm-proxy/status', () => {
  it('401 ohne Admin', async () => {
    expect((await call(null)).status).toBe(401);
  });

  it('200 mit Upstream-Status, wenn der Proxy erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ backends: [{ name: 'a', healthy: true }] }), { status: 200 })));
    const res = await call('admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ proxy: expect.not.stringMatching(/offline/) });
  });

  it('200 proxy:offline + DB-Backends, wenn der Proxy nicht erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    listBackends.mockResolvedValueOnce([{ id: 1, name: 'a', enabled: true }]);
    const res = await call('admin');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proxy).toBe('offline');
    expect(body.backends).toEqual([{ id: 1, name: 'a', enabled: true }]);
  });
});
```

- [ ] **Failing-Test-Step (RED).** Ausführen:

```bash
cd website && pnpm vitest run src/pages/api/admin/llm-proxy/status.test.ts
# expected: FAIL (RED — status.ts + llm-proxy-db.ts existieren noch nicht)
```

## Task 5: Test-Inventar regenerieren (CI-Gate)

Nach dem Anlegen neuer Testdateien failt der CI-Inventar-Check, bis
`website/src/data/test-inventory.json` neu generiert und mitcommittet ist.

- [ ] Inventar regenerieren:

```bash
task test:inventory
```

- [ ] `website/src/data/test-inventory.json` zusammen mit den vier neuen Testdateien committen
      (die vier Einträge müssen im Diff erscheinen). Der finale `task test:*`-Verify-Block läuft
      zentral im Index-Plan (`tasks.md`) — hier bewusst nicht dupliziert.
