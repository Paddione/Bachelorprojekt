---
title: "dev-up-llm-proxy — Implementation Plan"
ticket_id: T002656
domains: [infra, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-up-llm-proxy — Implementation Plan

_Ticket: T002656 — Fragment des EPIC T002650. `sdlc:up` startet nach dem
llm-proxy auch das lokale Chat-Loadout, der Health-Gate prüft Readiness und
Loadout-Gesundheit, `sdlc:down` stoppt das Loadout vor dem Proxy. Kein
`dev:up`-Task (SSOT-Entscheidung in `openspec/specs/sdlc-isolation.md`:
`dev:`-Namespace gehört dem Staging-Stack)._

Zweistufig zerlegt (T002074 Partial-Modus): Der Orchestrator hält diesen Index
(File Structure, Partial-Manifest, finaler Verify-Task); die Partial-Task-Listen
liegen in `tasks.d/`. `plan-lint.sh` aktiviert den Partial-Modus über die
Existenz von `tasks.d/`.

## File Structure

Union aller Partials (disjunkt — keine Datei in zwei Partials, D1):

```
scripts/sdlc/llm-up.sh                       (net-new)  P1  — idempotenter Loadout-Start/Stopp via Proxy-Admin-API
scripts/sdlc/health-gate.sh                  (edit)     P1  — + Readiness-Probe (/health) + Loadout-Probe
taskfiles/Taskfile.sdlc.yml                  (edit)     P1  — sdlc:up/sdlc:down um llm-up-Schritte erweitern
tests/spec/sdlc-isolation/llm-up-health.bats (net-new)  P2  — BATS (task --dry-Reihenfolge + Fehlerpfade), STRUCT2
```

## Partials

Gang-Manifest (letzte Zeile ist die Tests-Rolle und trägt den STRUCT2-Failing-Test):

| id | file | role | target_files |
|----|------|------|--------------|
| P1 | tasks.d/p1-implement.md | impl | scripts/sdlc/llm-up.sh, scripts/sdlc/health-gate.sh, taskfiles/Taskfile.sdlc.yml |
| P2 | tasks.d/p2-tests.md | tests | tests/spec/sdlc-isolation/llm-up-health.bats |

**Ausführungsreihenfolge beim Execute:** P2 schreibt zuerst den roten Test
(`expected: FAIL`), P1 macht ihn grün (Skript + Gate + Taskfile). Details je
Partial in den `tasks.d/`-Dateien; jede Partial-Datei notiert ihre S1-Budgets.

<!-- vitest: kein neuer Test nötig — ausschließlich Shell/Taskfile/BATS im Scope,
     kein .ts/.svelte-Code. -->

## Verify (final — STRUCT3)

Der abschließende Verifikations-Task nach allen Partials. Führt das CI-Äquivalent
inkl. S1–S4-Ratchet aus. Nach Test-Änderungen zusätzlich das Test-Inventar
regenerieren und committen.

- [ ] **Rot→Grün-Nachweis (aus P2).** Der STRUCT2-Failing-Test in
      `tasks.d/p2-tests.md` (`tests/spec/sdlc-isolation/llm-up-health.bats`)
      ist vor P1 rot und nach P1 grün.
- [ ] `task test:changed` — gezielte Tests für die geänderten Domains
      (BATS-Selection + quality)
- [ ] `task test:inventory` — Test-Inventar regenerieren und
      `website/src/data/test-inventory.json` committen (neue BATS-Datei)
- [ ] `task freshness:regenerate` — generierte Artefakte aktualisieren
- [ ] `task freshness:check` — CI-Äquivalent (Freshness + quality:check
      S1–S4-Ratchet + Baseline-Assertion)
