---
title: "batch-openspec-tooling-fixes — Implementation Plan"
ticket_id: T003812
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-openspec-tooling-fixes — Implementation Plan

_Ticket: T003812 — Batch: openspec.sh-Tooling-Fixes_

## File Structure

```
scripts/openspec.sh                   # Hauptdatei
scripts/plan-touched-files.sh         # Partials-Manifest-Auswertung
scripts/plan-preflight.sh             # Schritt-5-Reihenfolge
tests/spec/openspec-workflow/         # Guards
```

## Child Tickets (aus T003810-Beschreibung)

Behandelt Tooling-Fixes rund um openspec.sh, plan-touched-files.sh und plan-preflight.sh.

## Tasks

### P1: openspec.sh propose schreibt .ticket zuverlaessig

**Datei:** `scripts/openspec.sh`

### P2: plan-touched-files.sh wertet Partials-Manifest aus

**Datei:** `scripts/plan-touched-files.sh`

### P3: Guard-Tests

**Datei:** `tests/spec/openspec-workflow/`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/
# expected: FAIL (rot — Tooling-Fixes noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
