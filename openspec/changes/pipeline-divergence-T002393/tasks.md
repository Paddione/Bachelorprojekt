---
title: "pipeline-divergence-T002393 — Implementation Plan"
ticket_id: T002393
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pipeline-divergence-T002393 — Implementation Plan

_Ticket: T002393_

## File Structure

```
CHANGED:
  scripts/factory/pipeline.mjs       — port missing blocks from pipeline.js
  tests/spec/software-factory.bats   — update PIPELINE_SCRIPT/PJS references
  scripts/factory/pipeline.js        — remove (dublette entfernen nach Migration)
  Taskfile.factory.yml               — update pipeline.js → pipeline.mjs refs
  Taskfile.yml                       — update pipeline.js → pipeline.mjs refs
```

## Tasks

### 1. Failing-Test (RED)

Schreibe BATS-Test der die Divergenz nachweist: pipeline.mjs hat nicht den Partial-Fanout (T002074) und Guard-Overwrite (T002286), die pipeline.js bereits hat.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pipeline-divergence-T002393.bats
# expected: FAIL
```

### 2. Fehlende Blöcke portieren (GREEN)

Portiere die fehlenden Blöcke aus pipeline.js nach pipeline.mjs:
- Partial-Fanout (T002074)
- Guard-Overwrite (T002286)
- Reihenfolge-Korrektur (T002327)

Verifiziere mit BATS-Test aus Task 1 — muss GREEN sein.

### 3. pipeline.js entfernen, Referenzen umstellen

- Lösche `scripts/factory/pipeline.js`
- Aktualisiere alle Referenzen auf `pipeline.mjs` in:
  - `Taskfile.factory.yml`
  - `Taskfile.yml`
  - `tests/spec/software-factory.bats` (PIPELINE_SCRIPT/PJS)
  - Alle weiteren im Grep gefundenen Referenzen

### 4. Tests aktualisieren & CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
