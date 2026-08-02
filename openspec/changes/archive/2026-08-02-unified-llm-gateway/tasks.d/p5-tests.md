# p5-tests — RED-Parität & Anti-Drift-Tests für das unified-llm-gateway

Rolle: `tests`. Dieses Partial ist der **STRUCT2-Partial** mit dem RED-Failing-Test-Step. Es schreibt
die Golden-Parity- und Anti-Drift-Tests, die die Szenarien aus
`openspec/changes/unified-llm-gateway/specs/local-llm-proxy.md` und
`specs/software-factory.md` operationalisieren. Die neuen Assertions sind **absichtlich rot**, bis die
Produktions-Partials (p1 Proxy-Core, p3 Factory-Wake) landen — sie fangen exakt die drei heutigen
Divergenzen ein (Fixup-Byte-Drift, fehlender Billing-Fixup, Silent-Model-Fallback) plus die
Backend-Port-Bypässe. Es werden **ausschließlich** Testdateien und das regenerierte Test-Inventar
angefasst — D1-disjunkt zu p1/p2/p3 (Produktions-Code) und p4 (Docs).

## File Structure

| Datei | Status | Ist (`wc -l`) | S1-Budget |
|---|---|---|---|
| `scripts/llm-proxy/server.test.mjs` | umgeschrieben | 67 | 433 (`.mjs` Limit 500, nicht baselined → 500 − 67) |
| `tests/spec/local-llm-proxy.bats` | erweitert + IDs umbenannt | 116 | S1-ungated (`.bats` nicht im S1-Gate) |
| `tests/spec/software-factory.bats` | erweitert + 1 Test angepasst | 4070 | S1-ungated (`.bats` nicht im S1-Gate) |
| `website/src/data/test-inventory.json` | regeneriert (generiertes Artefakt) | — | S1-ungated (generiert via `task test:inventory`) |

Nur `server.test.mjs` trägt ein numerisches S1-Budget (`.mjs`, 500er-Limit, nicht baselined → 433).
Die beiden `.bats`-Dateien sind nicht Teil des S1-Extension-Gates; die JSON ist ein generiertes
Artefakt — beide werden vom S1-Ratchet nicht bewertet.

Testrunner-Pfade im Repo (verifiziert):
- Scripts-Node-Tests: `node --test scripts/llm-proxy/server.test.mjs` (Muster: `scripts/factory/provision.test.mjs`)
- BATS: `tests/unit/lib/bats-core/bin/bats <file>`

### Abbildung Szenario → Test (Nachweispflicht)

| Spec-Szenario | Testdatei |
|---|---|
| local-llm-proxy · *Golden parity test for both fixups* | `server.test.mjs` (Fix1 + Fix2 golden) |
| local-llm-proxy · *Wildcard alias resolves logical model id* | `server.test.mjs` (`"*"`-Alias) |
| local-llm-proxy · *Strict mode rejects unknown model ids* | `server.test.mjs` (strict→null) + `local-llm-proxy.bats` (404) |
| local-llm-proxy · *healthz reflects backend health* | `local-llm-proxy.bats` (`/healthz` 200/503) |
| local-llm-proxy · *Static config lint blocks backend-port bypasses* | `local-llm-proxy.bats` (Config-Lint) |
| local-llm-proxy · *Proxy as sole LLM gateway* (DB-Zeilen) | `local-llm-proxy.bats` (DB-Anti-Drift) |
| software-factory · *Registration writes gateway URL* | `software-factory.bats` (FA-SF-76) |
| software-factory · *Staging wakes the factory* | `software-factory.bats` (FA-SF-74) |
| software-factory · *Dead gateway does not burn slots* | `software-factory.bats` (FA-SF-75) |
| software-factory · *Phases route through the gateway* (opus-Routing) | `software-factory.bats` (FA-SF-70 angepasst) |

## Task 1: `scripts/llm-proxy/server.test.mjs` — Golden-Parität + Strict/Wildcard (RED-Anker, STRUCT2)

Datei **vollständig** durch den folgenden Inhalt ersetzen. Sie importiert die reinen Entscheider aus
`discovery.mjs` (`resolveModel`, `_testSeed`) und `fixups.mjs` (`applyFixups`) — genau die Signaturen,
die heute schon existieren. Zwei Verhaltensänderungen der Produktions-Partials werden hier
festgeschrieben:

- **Fix 1 byte-exakt** — die bestehende Fixup-Assertion prüft nur `role`, nicht den Content; sie wird
  auf die **byte-identische** Form umgeschrieben (kein `[system] `-Präfix). Das schlägt heute fehl,
  weil `fixups.mjs` den Marker voranstellt.
- **Fix 2 Billing-Header** — neuer Golden-Test; schlägt heute fehl, weil der Fixup fehlt (`applyFixups`
  warnt und lässt den Body unverändert).
- **Strict-Semantik** — der bestehende Stale-ID-Fallback-Test assertiert heute den Silent-Fallback;
  er wird auf `null` (404-Pfad) umgeschrieben, plus ein Loose-Modus- und ein Wildcard-Alias-Test.

Die Fixture-Bytes (Fix-1-Content unverändert; Fix-2-Konstante `x-anthropic-billing-header:
(normalized-for-cache);`) stammen aus der Paritäts-Referenz in `design.md` (Abschnitt „Fixup-Verhalten
Alt-Proxy").

```js
// scripts/llm-proxy/server.test.mjs
// Pure-function tests for proxy routing + request fixups. Zero deps, zero I/O.
// Run: node --test scripts/llm-proxy/server.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModel, _testSeed } from './discovery.mjs'
import { applyFixups } from './fixups.mjs'

// Helper: getBackends() returning the given array
const mockGet = (arr) => () => arr

const backendA = { name: 'a', baseUrl: 'http://a:1234/v1', kind: 'lmstudio', priority: 1, apiKeyEnv: '', fixups: ['bonsai-system-role-fixup'], modelAliases: { sonnet: 'm1' } }
const backendB = { name: 'b', baseUrl: 'http://b:1234/v1', kind: 'lmstudio', priority: 2, apiKeyEnv: '', fixups: [], modelAliases: {} }
// Backend that carries the wildcard alias for the logical model id (D5).
const backendWild = { name: 'a', baseUrl: 'http://a:1234/v1', kind: 'llamacpp', priority: 1, apiKeyEnv: '', fixups: [], modelAliases: { 'ternary-bonsai': '*' } }

// Seed internal catalog: a healthy with m1 (prio 1), b healthy with m2 (prio 2)
const seedAB = () => _testSeed({ backends: [
  { name: 'a', priority: 1, healthy: true, models: ['m1'] },
  { name: 'b', priority: 2, healthy: true, models: ['m2'] },
] })
seedAB()

test('resolveModel: exact ID -> backend serving that model', () => {
  seedAB()
  const r = resolveModel('m2', mockGet([backendA, backendB]))
  assert.equal(r.backend.name, 'b')
  assert.equal(r.servedModel, 'm2')
  assert.equal(r.substituted, false)
})

test('resolveModel: alias -> target model of highest-priority backend', () => {
  seedAB()
  const r = resolveModel('sonnet', mockGet([backendA, backendB]))
  assert.equal(r.backend.name, 'a')
  assert.equal(r.servedModel, 'm1')
  assert.equal(r.substituted, true)
})

// D5 strict mode (default, LLM_PROXY_LOOSE_FALLBACK unset): an unknown id yields null so the
// server answers 404 unknown_model instead of silently serving some other model.
test('resolveModel: strict mode -> unknown id yields null (404 unknown_model path)', () => {
  seedAB()
  delete process.env.LLM_PROXY_LOOSE_FALLBACK
  const r = resolveModel('ghost', mockGet([backendA, backendB]))
  assert.equal(r, null)
})

// D5 loose mode: opt-in global fallback to the first healthy backend. The flag is read per call.
test('resolveModel: loose mode -> unknown id falls back to first healthy backend', () => {
  seedAB()
  process.env.LLM_PROXY_LOOSE_FALLBACK = '1'
  try {
    const r = resolveModel('ghost', mockGet([backendA, backendB]))
    assert.equal(r.backend.name, 'a')
    assert.equal(r.servedModel, 'm1')
    assert.equal(r.substituted, true)
  } finally {
    delete process.env.LLM_PROXY_LOOSE_FALLBACK
  }
})

// D5 wildcard alias: logical id "ternary-bonsai" -> "*" -> first model of that backend.
test('resolveModel: wildcard alias "*" resolves to first model of the backend', () => {
  _testSeed({ backends: [{ name: 'a', priority: 1, healthy: true, models: ['m1'] }] })
  const r = resolveModel('ternary-bonsai', mockGet([backendWild]))
  assert.equal(r.backend.name, 'a')
  assert.equal(r.servedModel, 'm1')
})

test('resolveModel: no healthy backend -> null (caller sends 503 no_backend)', () => {
  _testSeed({ backends: [] })
  const r = resolveModel('m1', mockGet([]))
  assert.equal(r, null)
  seedAB()
})

// ── Golden fixup parity (D2) ────────────────────────────────────────────────
// Fix 1: a mid-array system message becomes role:"user" with content BYTE-IDENTICAL
// (no "[system]" prefix). Fails today because fixups.mjs prepends the marker.
test('applyFixups Fix1 golden: mid-array system -> role user, content byte-identical', () => {
  const body = { messages: [
    { role: 'system', content: 'sys0' },
    { role: 'user', content: 'hi' },
    { role: 'system', content: 'MID_CONTENT' },
  ] }
  const out = applyFixups(['bonsai-system-role-fixup'], body)
  assert.equal(out.messages[0].role, 'system')          // i=0 stays system
  assert.equal(out.messages[2].role, 'user')            // mid-array rewritten to user
  assert.equal(out.messages[2].content, 'MID_CONTENT')  // BYTE-IDENTICAL — no prefix
})

// Fix 2: an Anthropic-shape billing header (randomized suffix) is normalised to a
// cache-stable constant. Fails today because billing-header-cache-fixup does not exist.
test('applyFixups Fix2 golden: billing-header normalised to cache constant', () => {
  const body = { system: [{ type: 'text', text: 'x-anthropic-billing-header: sess-7f3a91b2c8' }], messages: [] }
  const out = applyFixups(['billing-header-cache-fixup'], body)
  assert.equal(out.system[0].text, 'x-anthropic-billing-header: (normalized-for-cache);')
})

test('applyFixups: empty fixup list leaves body unchanged (deep equal)', () => {
  const body = { messages: [{ role: 'system', content: 'x' }, { role: 'system', content: 'y' }] }
  assert.deepEqual(applyFixups([], body), body)
})
```

Assertion-Konsistenz-Notizen (Test-Assertion-Konsistenz-Hard-Rule):
- Der Wildcard-Test gibt heute `m1` auch über den (noch aktiven) globalen Silent-Fallback zurück; nach
  p1 ist dieser Pfad im Strict-Default aus, sodass `m1` **nur** über die `"*"`-Alias-Auflösung kommt —
  die Assertion bleibt in beiden Welten wahr und wird nach p1 zum echten Wildcard-Guard.
- Der Loose-Test setzt `LLM_PROXY_LOOSE_FALLBACK` **vor** dem Aufruf und räumt es im `finally` wieder
  ab; er setzt voraus, dass p1 das Flag pro Aufruf liest (nicht beim Modul-Load). Diese Erwartung ist im
  Spec-Delta *Dynamic model discovery with availability fallback* verankert.

- [ ] **RED-Failing-Test-Step (STRUCT2).** Suite mit dem echten Runner ausführen — sie ist rot: der
      Fix-1-Golden-Test schlägt an `content === 'MID_CONTENT'` fehl (heute `'[system] MID_CONTENT'`),
      der Fix-2-Golden-Test an der fehlenden Konstante, der Strict-Test an `null` (heute Silent-Fallback).

```bash
node --test scripts/llm-proxy/server.test.mjs
# expected: FAIL (RED — Fix1 hat noch das [system]-Präfix, Fix2 fehlt, resolveModel ist noch nicht strict)
```

## Task 2: `tests/spec/local-llm-proxy.bats` — inventarfähige IDs, `/healthz`, Strict-404, Config-Lint, DB-Anti-Drift

Die vorhandene `setup()`/`teardown()`/`_start_stub`/`_start_proxy`/`_skip_if_no_db`-Scaffolding und die
`LLM_PROXY_BACKENDS_JSON`-Stub-Konvention bleiben unverändert. `LLM_PROXY_LOOSE_FALLBACK` wird im
Test **nicht** gesetzt (Default = strict).

- [ ] **Test-Titel auf inventarfähige IDs umbenennen.** `build-test-inventory.sh` extrahiert aus
      `.bats` nur `@test`-Titel, die auf `[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+` matchen; die heutigen
      Prosa-Titel liefern **null** Inventar-Einträge. Die fünf bestehenden Tests erhalten die Präfixe
      `FA-LLMPROXY-1`…`5` (Test 3 wird dabei inhaltlich auf Strict-404 umgeschrieben, siehe unten):

  - `FA-LLMPROXY-1: GET /v1/models aggregiert beide Backends (m1 + m2)`
  - `FA-LLMPROXY-2: Routing exakte ID m2 -> Backend b via x-llm-proxy-backend`
  - `FA-LLMPROXY-3: strict mode -> unbekannte Modell-ID => 404 unknown_model`  *(inhaltlich neu)*
  - `FA-LLMPROXY-4: alle Backends down -> 503 mit error.code no_backend`
  - `FA-LLMPROXY-5: route-provider.sh factory-implement sonnet -> baseUrl :18235 (kein :8093)`

- [ ] **`FA-LLMPROXY-3` von Silent-Fallback auf Strict-404 umschreiben** (D5). Der alte Test erwartete
      `x-llm-proxy-served-model: m1` für eine unbekannte ID; im Strict-Default ist eine unbekannte ID
      jetzt ein Fehler. RED heute (Proxy fällt still auf m1 zurück → 200), GRÜN nach p1.

```bash
@test "FA-LLMPROXY-3: strict mode -> unbekannte Modell-ID => 404 unknown_model" {
  _start_proxy
  run curl -s -o /tmp/llmproxy_body -w '%{http_code}' \
    -H 'content-type: application/json' -d '{"model":"does-not-exist","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$output" = "404" ]
  grep -q '"unknown_model"' /tmp/llmproxy_body
}
```

- [ ] **`FA-LLMPROXY-6` — `GET /healthz` 200 + degraded-Felder wenn ≥1 Backend gesund** (D4). Nutzt die
      beiden gesunden Stubs; `/healthz` braucht einen abgeschlossenen Discovery-Probe-Zyklus, daher auf
      200 pollen (der Server bindet sofort, probet aber asynchron). RED heute (`/healthz` existiert nicht
      → 404), GRÜN nach p1.

```bash
@test "FA-LLMPROXY-6: GET /healthz 200 + degraded-Feld wenn >=1 Backend gesund" {
  _start_proxy
  local code=""
  for _ in $(seq 1 40); do
    code="$(curl -s -o /tmp/llmproxy_hz -w '%{http_code}' "http://127.0.0.1:${PROXY_PORT}/healthz")"
    [ "$code" = "200" ] && break
    sleep 0.25
  done
  [ "$code" = "200" ]
  grep -q '"healthy_backends"' /tmp/llmproxy_hz
  grep -q '"degraded"' /tmp/llmproxy_hz
}
```

- [ ] **`FA-LLMPROXY-7` — `GET /healthz` 503 wenn alle Backends down** (D4). Beide Stubs vor dem
      Proxy-Start killen; die erste Probe-Runde findet kein gesundes Backend → 503. RED heute, GRÜN nach p1.

```bash
@test "FA-LLMPROXY-7: GET /healthz 503 wenn alle Backends down" {
  kill "$PID_A" "$PID_B" 2>/dev/null; sleep 0.3
  _start_proxy
  run curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PROXY_PORT}/healthz"
  [ "$output" = "503" ]
}
```

- [ ] **`FA-LLMPROXY-8` — Config-Lint-Gate (fail-closed, ohne DB/Netz)** (D4). Grep-basiert; kein
      aktives `:8093`/`127.0.0.1:1234`-Literal in den vier Gateway-Consumer-Surfaces. Die Spec-Delta-
      Ausnahme („backend URLs are only allowed inside the `tickets.llm_proxy_backends` registry
      seeds/migrations and explicitly marked backend-internal docs") wird so umgesetzt: für die `.jsonc`
      linten wir **nur aktive `baseURL`-Zuweisungen** (Beschreibungs-/Doku-Strings bleiben erlaubt), für
      `.sh`/`.mjs` nur **Nicht-Kommentarzeilen** (`#` bzw. `//`). Seed-/Migrations-SQL liegt in keiner der
      vier Dateien. RED heute (agent-models `baseURL` → `:8093`; route-provider/pipeline aktive Zeile →
      `:1234`; provider-register aktive Zeile → `:8093`), GRÜN nach p1/p3.

```bash
@test "FA-LLMPROXY-8: Config-Lint -- keine Backend-Port-Literale in Gateway-Consumern (fail-closed)" {
  # Ausnahmeliste (dokumentiert): (1) tickets.llm_proxy_backends Seeds/Migrationen -- nicht in diesen
  # Dateien; (2) backend-interne Doku-/Kommentarzeilen und Beschreibungs-Strings. Wir linten aktive
  # Konfiguration: .jsonc -> nur "baseURL"-Zeilen; .sh/.mjs -> Nicht-Kommentarzeilen (# bzw. //).
  local hit
  hit="$(grep -E '"baseURL"' "${REPO_ROOT}/.opencode/agent-models.jsonc" | grep -E ':8093|127\.0\.0\.1:1234' || true)"
  [ -z "$hit" ]
  local f
  for f in scripts/factory/provider-register-bonsai.sh \
           scripts/factory/route-provider.sh \
           scripts/factory/pipeline.mjs; do
    hit="$(grep -vE '^[[:space:]]*(#|//)' "${REPO_ROOT}/${f}" | grep -E ':8093|127\.0\.0\.1:1234' || true)"
    [ -z "$hit" ]
  done
}
```

- [ ] **`_psql_tickets`-Helfer für die DB-Assertions ergänzen** (spiegelt den Helfer aus
      `tests/spec/software-factory.bats:190`, inklusive `-c postgres` und Pod-Guard):

```bash
_psql_tickets() {
  local q="$1" ctx="${FACTORY_CTX:-fleet}" ns="${FACTORY_NS:-workspace}" pod
  pod="$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db,shared-db-dev)' -o name 2>/dev/null | head -1)"
  [ -z "$pod" ] && return 1
  kubectl exec "$pod" -n "$ns" --context "$ctx" -c postgres -- psql -U website -d website -t -A -c "$q"
}
```

- [ ] **`FA-LLMPROXY-9` — DB-Anti-Drift + Registry-Alias** (D4/D5, skip-guarded über das bestehende
      `_skip_if_no_db`). Keine enabled `provider_config`- und keine `factory_model_slots`-Zeile zeigt
      direkt auf `:8093`/`:1234`; `llm_proxy_backends.model_aliases` von `llamacpp-bonsai` enthält die
      logische ID `ternary-bonsai`. In offline-CI übersprungen; lokal RED, bis die p1-Migration den Alias
      setzt.

```bash
@test "FA-LLMPROXY-9: DB Anti-Drift -- keine enabled Zeile auf :8093/:1234, Alias ternary-bonsai" {
  _skip_if_no_db
  run _psql_tickets "SELECT count(*) FROM tickets.provider_config WHERE enabled=true AND (base_url LIKE '%:8093%' OR base_url LIKE '%:1234%')"
  [ "$status" -eq 0 ]; [ "$output" = "0" ]
  run _psql_tickets "SELECT count(*) FROM tickets.factory_model_slots WHERE base_url LIKE '%:8093%' OR base_url LIKE '%:1234%'"
  [ "$status" -eq 0 ]; [ "$output" = "0" ]
  run _psql_tickets "SELECT model_aliases::text FROM tickets.llm_proxy_backends WHERE name='llamacpp-bonsai'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ternary-bonsai ]]
}
```

- [ ] **Suite ausführen** (BATS-Runner) — rot wegen der neuen Assertions (Strict-404, `/healthz`,
      Config-Lint):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
# expected: FAIL (RED -- /healthz + unknown_model fehlen im Proxy, Config-Surfaces zeigen noch :8093/:1234)
```

## Task 3: `tests/spec/software-factory.bats` — Wake, Pre-Dispatch-Gate, Registrierung, opus-Routing

Konventionen der Datei übernehmen (statische `grep`-Guards wie die bestehenden FA-SF-Tests; DB-Tests via
`_skip_if_no_db`). Neue IDs `FA-SF-74`…`76` (höchste bestehende ist `FA-SF-73`); der opus-Routing-Test
`FA-SF-70` wird angepasst.

- [ ] **`FA-SF-70` (um Zeile ~3074) auf die logische ID anpassen** (D5). Aktuell assertiert der Test
      `.provider=="ternary-bonsai-27b"`; nach p3 emittiert `route-provider.sh` für opus die logische ID
      `ternary-bonsai`. Assertion und Kommentar umstellen:

```bash
@test "FA-SF-70: route-provider.sh emits valid JSON keys for opus without DB" {
  run bash scripts/factory/route-provider.sh factory-plan opus
  [ "$status" -eq 0 ]
  # unified-llm-gateway: opus routet auf die logische ID ternary-bonsai am Gateway :18235 [T002102]
  echo "$output" | jq -e '.modelId and (.provider=="ternary-bonsai")'
}
```

- [ ] **`FA-SF-74` — stage-plan.sh weckt die Factory** (D6). Statische Guards: `stage-plan.sh` enthält
      nach seinen DB-Writes den `factory_control`-Force-Tick-Upsert und den Fire-and-forget-Start von
      `factory.service`. RED heute (keins von beidem vorhanden), GRÜN nach p3.

```bash
@test "FA-SF-74: stage-plan.sh sets the force-tick flag and fire-and-forgets factory.service" {
  SP="scripts/vda/ticket/stage-plan.sh"
  run grep -Eq "tickets\.factory_control" "$SP";                [ "$status" -eq 0 ]
  run grep -Eq "force-tick" "$SP";                              [ "$status" -eq 0 ]
  run grep -Eq "systemctl --user start factory\.service" "$SP"; [ "$status" -eq 0 ]
}
```

- [ ] **`FA-SF-75` — dispatcher-bridge Pre-Dispatch-Gate** (D4). Der `/healthz`-Probe steht **vor** dem
      `budget-guard.sh`-Aufruf im Per-Ticket-Loop. `awk` vergleicht die Zeilennummer des ersten
      `healthz`-Vorkommens mit der des ersten `budget-guard.sh`-Aufrufs. RED heute (kein `healthz`), GRÜN
      nach p3.

```bash
@test "FA-SF-75: dispatcher-bridge.sh probes /healthz before budget-guard.sh (pre-dispatch gate)" {
  DB="scripts/factory/dispatcher-bridge.sh"
  run grep -Eq "healthz" "$DB"; [ "$status" -eq 0 ]
  run awk '/healthz/{if(!h)h=NR} /budget-guard\.sh/{if(!b)b=NR} END{exit !(h>0 && b>0 && h<b)}' "$DB"
  [ "$status" -eq 0 ]
}
```

- [ ] **`FA-SF-76` — provider-register-bonsai.sh registriert Gateway + logische ID** (D7). Statische
      Guards: enthält `127.0.0.1:18235` und die logische ID `ternary-bonsai`, **kein** stales
      `ternary-bonsai-27b` und **kein** `:8093`. Der Absenz-Check auf `-27b` ist der wirksame Teil (weil
      `ternary-bonsai` ein Teilstring von `ternary-bonsai-27b` ist). RED heute (Datei schreibt `:8093` +
      `ternary-bonsai-27b`), GRÜN nach p3.

```bash
@test "FA-SF-76: provider-register-bonsai.sh registers gateway :18235 + logical id ternary-bonsai" {
  PR="scripts/factory/provider-register-bonsai.sh"
  run grep -Fq "127.0.0.1:18235" "$PR";  [ "$status" -eq 0 ]
  run grep -Eq "ternary-bonsai" "$PR";   [ "$status" -eq 0 ]
  run grep -Eq "ternary-bonsai-27b" "$PR"; [ "$status" -ne 0 ]   # stale suffix gone
  run grep -Fq ":8093" "$PR";            [ "$status" -ne 0 ]     # no backend port
}
```

- [ ] **Suite ausführen** (BATS-Runner) — rot wegen der vier angepassten/neuen Guards:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (RED -- route-provider emittiert noch -27b; stage-plan/dispatcher/register noch nicht angepasst)
```

## Task 4: Test-Inventar regenerieren (CI-Gate)

Nach dem Umbenennen/Anlegen der Test-IDs failt der CI-Inventar-Check, bis
`website/src/data/test-inventory.json` neu generiert und mitcommittet ist (`local-llm-proxy.bats` liefert
neu die `FA-LLMPROXY-1..9`-Einträge; `software-factory.bats` neu `FA-SF-74..76`).

- [ ] Inventar regenerieren und mitcommitten:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

Der finale `task test:changed` / `task freshness:*`-Verify-Block läuft zentral im Index-Plan
(`tasks.md`) und wird hier bewusst nicht dupliziert.
