---
title: Default-Factory-Modell im llm-proxy-Webinterface waehlbar und sperrbar
ticket_id: T013144
domains: [llm, factory, scripts, test]
status: implemented
---

# factory-model-lock — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|---|---|---|
| `scripts/llm-proxy/loadouts.mjs` | 414 | 386 |
| `scripts/llm-proxy/server.mjs` | 679 | 121 |
| `scripts/llm-proxy/ui/index.html` | 109 | ungated (.html hat kein S1-Limit) |
| `scripts/llm/loadouts.json` | — | ungated (.json hat kein S1-Limit) |
| `scripts/factory/lib.sh` | 134 | 666 |
| `scripts/factory/route-provider.sh` | 174 | 626 |
| `scripts/factory/dispatcher-bridge.sh` | 194 | 606 |
| `scripts/factory/provider-register-local.sh` | 60 | 740 |
| `scripts/factory/pipeline.mjs` | 850 | ungated (s1.ignore, T000460) |
| `scripts/llm-proxy/loadouts.test.mjs` | 355 | 445 |
| `scripts/llm-proxy/server.test.mjs` | 201 | 599 |
| `scripts/llm-proxy/factory-pin.test.mjs` | neu | 800 |
| `tests/spec/local-llm-proxy/factory-model-lock.bats` | neu | ungated (.bats hat kein S1-Limit) |
| `tests/spec/software-factory/factory-model-lock.bats` | neu | ungated (.bats hat kein S1-Limit) |
| `Taskfile.yml` | — | ungated (.yml hat kein S1-Limit) |
| `.github/workflows/ci.yml` | — | ungated (.yml hat kein S1-Limit) |

Kein Budget liegt unter 20 % seiner wirksamen Schwelle; kein Split noetig.

<!-- vitest: kein neuer Test noetig, weil diese Aenderung components/website/src nicht beruehrt -->

## Partials

| ID | Datei | Rolle | target_files | deps |
|---|---|---|---|---|
| P1 | `tasks.d/p1-proxy-core.md` | proxy | `scripts/llm-proxy/loadouts.mjs`, `scripts/llm-proxy/server.mjs`, `scripts/llm/loadouts.json` |  |
| P2 | `tasks.d/p2-admin-ui.md` | ui | `scripts/llm-proxy/ui/index.html` | P1 |
| P3 | `tasks.d/p3-factory-consumers.md` | factory | `scripts/factory/lib.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/dispatcher-bridge.sh`, `scripts/factory/provider-register-local.sh`, `scripts/factory/pipeline.mjs` | P1 |
| P4 | `tasks.d/p4-tests.md` | tests | `scripts/llm-proxy/factory-pin.test.mjs`, `scripts/llm-proxy/loadouts.test.mjs`, `scripts/llm-proxy/server.test.mjs`, `tests/spec/local-llm-proxy/factory-model-lock.bats`, `tests/spec/software-factory/factory-model-lock.bats`, `Taskfile.yml`, `.github/workflows/ci.yml` | P1, P2, P3 |

Die Dateimengen sind disjunkt. P4 traegt die Tests-Rolle und den Failing-Test-Step.

## Reihenfolge

P1 zuerst — P2 und P3 lesen beide die Route, die P1 anlegt. P2 und P3 sind danach
voneinander unabhaengig. P4 laeuft zuletzt, weil sein Failing-Test-Step gegen die
Schnittstellen aus P1 bis P3 schreibt.

## Task 1 — P1: Proxy-Kern (Validierung, Admin-Route, Seed) ✅

Siehe `tasks.d/p1-proxy-core.md`.

## Task 2 — P2: Auswahl im Webinterface ✅

Siehe `tasks.d/p2-admin-ui.md`.

## Task 3 — P3: Factory-Konsumenten ✅

Siehe `tasks.d/p3-factory-consumers.md`.

## Task 4 — P4: Tests und Runner-Registrierung ✅

Siehe `tasks.d/p4-tests.md`.

## Task 5 — Verifikation

Abschliessende Pflichtlaeufe auf dem Branch:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich, weil diese Aenderung `scripts/llm/loadouts.json` schreibt und die
Proxy-Testliste erweitert:

```bash
task llm:loadouts:check          # kanonische Dateiform nach dem Schreiben durch writeLoadouts
task test:llm-proxy              # alle node:test-Dateien inkl. der neuen factory-pin.test.mjs
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/factory-model-lock.bats \
                                  tests/spec/software-factory/factory-model-lock.bats \
                                  tests/spec/software-factory/factory-model-id-default.bats \
                                  tests/spec/factory-escalation-ladder.bats
```

Die beiden bestehenden Suiten laufen bewusst mit: `factory-model-id-default.bats` prueft
die Default-Gleichheit, die Task 3 anfasst, und `factory-escalation-ladder.bats` haelt die
Leiter fest, die der Sperrzweig umgeht. Beide muessen gruen bleiben.
