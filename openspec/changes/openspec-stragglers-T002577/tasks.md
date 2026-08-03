---
title: "openspec-stragglers-T002577 — Implementation Plan"
ticket_id: T002577
domains: [openspec-workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-stragglers-T002577 — Implementation Plan

_Ticket: T002577_

## File Structure

```
scripts/openspec.sh                                        (geändert) — --no-merge-Archivierungspfad in cmd_archive
scripts/openspec-merge.mjs                                 (geändert) — Guard-Reihenfolge verifizieren/absichern (falls nötig)
openspec/changes/<51 Slugs>/                               (entfernt) — Batch-Archivierung der Nachzügler
openspec/changes/archive/<datum>-<slug>/                   (neu)      — archivierte Nachzügler
openspec/specs/<7 Ziel-Specs>.md                           (geändert) — Delta-Reparatur der modified-target-Fälle (via Merge)
tests/spec/openspec-workflow/archive-no-merge.bats         (neu)      — BATS: --no-merge-Pfad + Atomarität
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Tests für den `--no-merge`-Pfad und die Atomarität
      (Guards vor jedem Schreibvorgang). Erwartet: rot, weil `--no-merge` noch nicht existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-no-merge.bats
# expected: FAIL (rot — --no-merge-Flag fehlt noch)
```

- [ ] **Fix-Step (GREEN).** `--no-merge`-Flag gebaut, Guard-Reihenfolge abgesichert, 51 Nachzügler
      archiviert, modified-target-Deltas repariert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-no-merge.bats  # grün
bash scripts/openspec.sh validate                                                     # grün
```

- [ ] **Final Verification.** Die verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Task 1 — Skript-Änderung: `--no-merge`-Archivierungspfad

`scripts/openspec.sh cmd_archive` bekommt ein `--no-merge`-Flag. In diesem Modus wird das
Change-Verzeichnis ins Archiv verschoben, ohne das Delta in die SSOT zu mergen. Die
Stub-/Target-Guards werden für diesen Pfad übersprungen, da kein Merge stattfindet. Ohne
`--no-merge` bleibt das bestehende fail-closed Verhalten unverändert.

**Akzeptanzkriterien:**

- [ ] `openspec.sh archive <slug> --no-merge` verschiebt das Change-Verzeichnis ins Archiv und merged KEIN Delta in die SSOT.
- [ ] `openspec.sh archive <slug>` (ohne `--no-merge`) bricht weiterhin fail-closed am Skeleton-Stub ab.
- [ ] Der `--no-merge`-Pfad ist explizit dokumentiert (Usage-Text in `cmd_archive`).

## Task 2 — Guard-Reihenfolge-Fix + BATS (Nebenbefund)

Der Zwei-Pass (`_check_delta` vor `_merge_delta`, T002581) existiert bereits und baut die
`--create-new`-Skeleton-SSOT nur im Speicher auf. Dieser Task verifiziert die Atomarität über
alle Guard-Varianten und ergänzt einen BATS-Test, der belegt, dass ein fehlschlagender Guard
keine SSOT-Datei erzeugt oder verändert und das Change-Verzeichnis unangetastet lässt.

**Akzeptanzkriterien:**

- [ ] BATS-Test: fehlschlagender Guard (MODIFIED-Ziel fehlt) lässt die SSOT unverändert und das Change-Verzeichnis in place.
- [ ] BATS-Test: fehlschlagender Guard (`--create-new` ohne Requirement-Block) erzeugt KEINE verwaiste Skeleton-SSOT.
- [ ] BATS-Test: erfolgreicher Lauf merged und archiviert atomar.

## Task 3 — Batch-Archivierung der 51 Nachzügler

Quelle: `openspec/changes/archive/2026-08-02-openspec-archive-backlog/stragglers.md`.

**3a. 24 mishap-*-Bundles via `--no-merge`** (Prozess-Notizen, kein Spec-Delta):

```
mishap-bundle-t002471 mishap-t001867 mishap-t001868 mishap-t001873 mishap-t001927
mishap-t001973 mishap-t001974 mishap-t002137 mishap-t002239 mishap-t002261
mishap-t002273 mishap-t002291 mishap-t002339 mishap-t002341 mishap-t002352
mishap-t002373 mishap-t002374 mishap-t002382 mishap-t002410 mishap-t002425
mishap-t002481 mishap-t002495 mishap-t002523 t002105-mishap-bundle
```

**3b. 7 modified-target-Fälle per Delta-Reparatur** (ausschließlich im Delta, NIEMALS direkt in
der SSOT — T002375-p5; MODIFIED→ADDED oder an die aktuelle SSOT anpassen, mit `#### Scenario:`-Blöcken):

```
agentic-terminal-sidekick  → sidekick-assistant.md (Ziel 'Agentic-Terminal-View …' fehlt)
bge-k8s-cpu-migration      → llm-pipeline.md (Ziel 'bge-Embedding-Layer …' fehlt)
factory-slot-sandbox       → software-factory.md (Ziel 'Pipeline-Slot → llama.cpp-Slot-Kopplung' fehlt)
llamacpp-embed-rerank      → llm-pipeline.md (Ziel 'LLM-Router Strict-Fail …' fehlt)
t002105-mishap-bundle      → auto-close-guard.md (Ziel 'Multi-partial Auto-Close Guard' fehlt)
t002184-livekit-removal    → fleet-operations.md (Ziel 'Brand-Specific TURN IP Pinning' fehlt)
ticket-pgpod-running-pod-selector → mcp-gateway.md (Ziel 'Architektur-Notiz …' fehlt)
```

**3c. 2 refusing-Fälle** — `--target-spec <parent>` oder bewusst `--force-new-component` wählen:

```
g-db01-fk-index-remediation   → Ziel-Spec g-db01-fk-indexes.md (ticket/gate-Slug-Muster)
t001592                       → Ziel-Spec t001592.md (ticket/gate-Slug-Muster)
```

**3d. Verbleibende skeleton-stub-Fälle (keine mishap-Bundles)** — Delta ausformulieren mit
`#### Scenario:`-Blöcken (Ratchet T002567):

```
auto-triage-grounding-T002399 bug-consolidation-T002330 e2e-bug-report-testdata-T002385
embed-skip-visibility exclude-latest-images factory-attempt-counter-T002389
factory-scout-backoff fix-ticket-tracking-T002279 k3d-kustomization-T002349
mcp-gateway-watchdog micro-spec-consolidation opencode-gemma26-agents
pipeline-divergence-T002393 plan-partials-embedding spec-security-gaps spec-test-rot
specs-keycloak-pocketid website-e2e-fixes worktree-divergence-guard-T002387
```

**Akzeptanzkriterien:**

- [ ] Alle 51 Slugs sind aus `openspec/changes/` entfernt und unter `openspec/changes/archive/` archiviert.
- [ ] Kein Delta wurde direkt in einer SSOT editiert (nur via `openspec.sh archive`-Merge oder `--no-merge`).
- [ ] Jedes ausformulierte Delta trägt `#### Scenario:`-Blöcke (Ratchet T002567).

## Task 4 — Verifikation

**Akzeptanzkriterien:**

- [ ] `bash scripts/openspec.sh validate` grün.
- [ ] `task test:changed` grün.
- [ ] BATS-Tests für `--no-merge`-Pfad und Atomarität grün.
- [ ] `openspec/changes/` enthält keine der 51 Nachzügler-Slugs mehr.
