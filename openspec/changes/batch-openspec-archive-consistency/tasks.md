---
title: "batch-openspec-archive-consistency — Implementation Plan"
ticket_id: T003813
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-openspec-archive-consistency — Implementation Plan

_Ticket: T003813 — Batch: OpenSpec-Archiv-Konsistenz auf main_

## File Structure

```
scripts/openspec.sh                            # Archiv-Logik
scripts/hooks/openspec-half-archive-check.sh   # Pre-Commit-Guard
tests/spec/openspec-workflow/                  # Guards
```

## Tasks

### P1: Half-Archived-Erkennung vorbeugen

**Dateien:** `scripts/openspec.sh`, `scripts/hooks/openspec-half-archive-check.sh`

### P2: Guard-Tests

**Datei:** `tests/spec/openspec-workflow/archive-consistency.bats`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-consistency.bats
# expected: FAIL (rot — Konsistenz-Guard noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
