---
title: "llm-proxy-probe-auth — Implementation Plan"
ticket_id: T002638
domains: [llm, scripts, ci-cd, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-probe-auth — Implementation Plan

_Ticket: T002638_

## File Structure

```
scripts/llm-proxy/discovery.mjs                        (geändert — Probe führt das Credential, Logzeile beim Übergang)
scripts/llm-proxy/discovery-probe-auth.test.mjs        (neu — node:test gegen einen echten HTTP-Server)
tests/spec/local-llm-proxy/proxy-tests-registered.bats (neu — Guard gegen unregistrierte Testdateien)
Taskfile.yml                                           (geändert — test:llm-proxy vervollständigt)
.github/workflows/ci.yml                               (geändert — llm-proxy-Schritt vervollständigt)
```

**S1-Budget** (Limit `.mjs` = 800; keine der Dateien ist in `docs/code-quality/baseline.json`
erfasst, also ist das Limit die wirksame Schwelle):

| Datei | aktuell | Restbudget |
|---|---|---|
| `scripts/llm-proxy/discovery.mjs` | 146 | 654 |
| `scripts/llm-proxy/discovery-probe-auth.test.mjs` | 71 | 729 |

`Taskfile.yml` und `.github/workflows/ci.yml` tragen die Endung `.yml`, für die
`docs/code-quality/gates.yaml` kein S1-Limit führt — sie stehen außerhalb des Budgets. Die
Änderung umfasst dort je zwei Zeilen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** `scripts/llm-proxy/discovery-probe-auth.test.mjs` startet
      einen echten HTTP-Server, der sich wie eine API mit Pflicht-Auth verhält (401 ohne Bearer,
      200 mit), und misst den Rückgabewert von `probeBackend`. Gegen die unreparierte Fassung
      von `discovery.mjs` muss der Positiv-Anker fallen. Prüfmodus ist command output
      verification (T002448-M4): kein Grep auf die Implementierung, sondern Messung dessen, was
      tatsächlich auf der Leitung ankommt.

```bash
node --test scripts/llm-proxy/discovery-probe-auth.test.mjs
# expected: FAIL (rot — der Probe-Pfad führt das Credential noch nicht; Test 1
#           "Positiv-Anker" schlägt fehl, weil das Backend unhealthy bleibt)
```

- [ ] **Fix-Step (GREEN).** In `scripts/llm-proxy/discovery.mjs` `resolveApiKey` aus
      `./backends.mjs` importieren und in `probeBackend` als `Authorization: Bearer <key>`
      mitgeben, sofern das Backend ein `apiKeyEnv` deklariert. Backends ohne `apiKeyEnv` senden
      weiterhin keinen Header — die lokalen llama.cpp-Server dürfen ihr Verhalten nicht ändern.
      Danach ist der Test aus dem vorigen Schritt grün.

```bash
node --test scripts/llm-proxy/discovery-probe-auth.test.mjs
```

- [ ] **Diagnose-Step.** In `startDiscovery` beim Übergang healthy → unhealthy **genau eine**
      Logzeile mit Backend-Name und Grund ausgeben (HTTP-Status, wenn das Backend geantwortet
      hat, sonst die Fehlermeldung). Solange das Backend unhealthy bleibt, keine weitere Zeile —
      der Probe läuft im Intervall und würde das Journal sonst fluten. `probeBackend` gibt den
      Grund dafür mit zurück, statt ihn im `catch {}` zu verwerfen. Beide Szenarien der
      Anforderung *A failed probe records why it failed* werden im selben Testlauf abgedeckt.

- [ ] **Guard-Step.** `tests/spec/local-llm-proxy/proxy-tests-registered.bats` anlegen: jede
      vorhandene `scripts/llm-proxy/*.test.mjs` muss sowohl im Target `test:llm-proxy`
      (`Taskfile.yml`) als auch im llm-proxy-Schritt (`.github/workflows/ci.yml`) genannt sein.
      Der Guard trägt einen Positiv-Anker (T002356-M1): erst belegen, dass eine registrierte
      Datei erkannt wird, dann die Negativ-Aussage über unregistrierte prüfen. Prüfmodus ist
      bewusst Source-Grep — das Ergebnis manifestiert sich ausschließlich in CI-Konfiguration,
      die dokumentierte Ausnahme in T002448-M4.

- [ ] **Registrierungs-Step.** Die bislang unregistrierten Dateien `exclusive-conflict`,
      `fixups` und `strip-markers` (zusammen 19 Tests, alle grün) sowie die neue
      `discovery-probe-auth` in `Taskfile.yml` und `.github/workflows/ci.yml` nachtragen.
      `mcp-bridge.test.mjs` bleibt getrennt unter `npx vitest run` — sie nutzt `vi.mock` und
      läuft unter `node --test` nicht.

```bash
task test:llm-proxy
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/proxy-tests-registered.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
