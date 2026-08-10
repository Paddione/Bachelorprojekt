---
title: "feat-gpu-loadout-consolidation-T003204 — Implementation Plan"
ticket_id: T003204
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# feat-gpu-loadout-consolidation-T003204 — Implementation Plan

_Ticket: T003204_

## File Structure

```
scripts/llm-proxy/loadouts.mjs                              (geändert) enabled-Feld im Schema
scripts/llm-proxy/server.mjs                                (geändert) Start lehnt disabled ab
scripts/llm/loadouts.json                                   (geändert) zwei Loadouts aus, reasoning aus
.opencode/agent-models.jsonc                                (geändert) vier Agenten umhängen
scripts/migrations/2026-08-10-disable-gptoss-devstral.sql   (neu)  Proxy-Backends aus
scripts/llm-proxy/loadouts.test.mjs                         (geändert) Schema-Fälle für enabled
tests/spec/local-llm-proxy/loadout-enabled-flag.bats        (neu)  RED: disabled lehnt Start ab
tests/spec/local-llm-proxy/opencode-agent-model-drift.bats  (geändert) Referenz auf disabled fällt durch
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-enabled-flag.md | impl | scripts/llm-proxy/loadouts.mjs, scripts/llm-proxy/server.mjs | |
| P2 | tasks.d/p2-config-and-agents.md | impl | scripts/llm/loadouts.json, .opencode/agent-models.jsonc, scripts/migrations/2026-08-10-disable-gptoss-devstral.sql | P1 |
| P3 | tasks.d/p3-tests.md | tests | tests/spec/local-llm-proxy/loadout-enabled-flag.bats, tests/spec/local-llm-proxy/opencode-agent-model-drift.bats, scripts/llm-proxy/loadouts.test.mjs | P1 |

## S1-Budgets

Wirksame Schwelle = Limit aus `docs/code-quality/gates.yaml` (keine dieser Dateien steht in
`docs/code-quality/baseline.json`, es gilt also das Limit).

| Datei | ist | Budget |
|---|---|---|
| `scripts/llm-proxy/loadouts.mjs` | 282 | 518 |
| `scripts/llm-proxy/server.mjs` | 617 | 183 |

`scripts/llm/loadouts.json`, `.opencode/agent-models.jsonc`, die `.sql`-Migration und die
`.bats`-Dateien tragen Endungen ohne S1-Limit — für sie ist keine Budgetangabe sinnvoll.

Der Zuwachs ist in beiden Dateien klein: das Schema bekommt eine Feldprüfung, der Server eine
Ablehnungsbedingung im bestehenden `startLoadout`. Sollte `server.mjs` die 183 Zeilen ausreizen,
gehört die Prüfung nach `loadouts.mjs` verschoben statt in den Server geschrieben.

## Reihenfolge und Abhängigkeit zu T003205

P3 schreibt zuerst den roten Test, dann P1 → P2.

**Vor der Umsetzung auf frisches `main` rebasen.** T003205 ändert dieselbe Datei
`scripts/llm/loadouts.json` (fügt den Top-Level-Schlüssel `roles` hinzu). Wird dieser Branch vor
dessen Merge implementiert, entsteht ein vermeidbarer Konflikt. Der Konflikt wäre harmlos
auflösbar — verschiedene Stellen derselben Datei —, kostet aber Zeit ohne Gegenwert.

## Verify (RED → GREEN)

Der Failing-Test-Step liegt in `tasks.d/p3-tests.md` (Rolle `tests`).

- [ ] **Final Verification.** Die drei verpflichtenden Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Abnahme am laufenden System** (nicht CI-fähig, deshalb Abnahme-Schritt statt Test):

```bash
# 1. Ein deaktiviertes Loadout lehnt den Start ab statt zu starten
curl -s -o /dev/null -w '%{http_code}\n' -XPOST http://127.0.0.1:18235/admin/loadouts/devstral-quality/start
# erwartet: 4xx mit Begruendung 'disabled', NICHT 200

# 2. brain-ingest laeuft weiter — das Abschalten traf nur das Chat-Loadout
curl -s http://127.0.0.1:18235/admin/loadouts/status | jq -r '.[] | select(.slug=="brain-ingest") | .slug'
# erwartet: brain-ingest

# 3. Kein Agent zeigt mehr auf ein deaktiviertes Loadout
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/opencode-agent-model-drift.bats
# erwartet: grün
```
