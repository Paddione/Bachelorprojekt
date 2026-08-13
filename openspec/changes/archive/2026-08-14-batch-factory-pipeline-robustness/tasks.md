---
title: "batch-factory-pipeline-robustness — Implementation Plan"
ticket_id: T003810
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-factory-pipeline-robustness — Implementation Plan

_Ticket: T003810 — Batch: Factory-Pipeline-Robustheit (Retry-Hänger + psql-Default)_

## File Structure

```
scripts/factory/pipeline.js       # Retry-Logik, Exit-6-Behandlung
scripts/factory/lib.sh             # factory_psql Default-Aufloesung
tests/spec/software-factory/       # Guards
```

## Child Tickets

| Ticket | Titel |
|--------|-------|
| T003625 | Factory stuck on T002827: 3 retries exit 6, no implementation |
| T003627 | T002848 plan staged and factory-retried 3x after known-fixed |
| T003629 | T002877 orchestrator produced uncommitted work before dying |
| T003544 | factory_psql defaultet erst in factory_resolve |

## Tasks

### P1: Retry-Limit + Stale-Erkennung

**Datei:** `scripts/factory/pipeline.js`

Drei aufeinanderfolgende Exit-6-Retries ohne Implementierungs-Commit bedeuten: Plan ist nicht
umsetzbar. Nach 3 Retries Ticket auf `planning` zuruecksetzen und Worktree freigeben, statt
endlos zu wiederholen.

### P2: factory_psql Default-Aufloesung vorziehen

**Datei:** `scripts/factory/lib.sh`

`FACTORY_CTX`-Default auf Top-Level statt erst in `factory_resolve_data_ns` setzen, damit
`source scripts/factory/lib.sh` bereits einen gueltigen Kontext hat.

### P3: Guard-Tests

**Datei:** `tests/spec/software-factory/retry-limit.bats`

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/retry-limit.bats
# expected: FAIL (rot — Retry-Limit noch nicht implementiert) — war rot: 3 von 4 Tests fehlten
```

- [x] **Fix-Step (GREEN).** P1 in scripts/factory/opencode-exec.sh (Exit-6-Pfad; pipeline.js
  existiert nicht mehr, seit #3450/T002393 durch pipeline.mjs ersetzt), P2 in
  scripts/factory/lib.sh (FACTORY_CTX-Default auf Top-Level). 4/4 Tests gruen.

- [x] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
