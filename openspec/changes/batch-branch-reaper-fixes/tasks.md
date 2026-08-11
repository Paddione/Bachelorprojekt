---
title: "batch-branch-reaper-fixes — Implementation Plan"
ticket_id: T003794
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-branch-reaper-fixes — Implementation Plan

_Ticket: T003794 — Batch: branch-reaper.sh Fixes_

## File Structure

```
scripts/branch-reaper.sh              # Hauptdatei — alle 4 Kinder
tests/spec/repo-hygiene/branch-reaper/ # Guards
```

## Child Tickets

| Ticket | Titel |
|--------|-------|
| T003182 | meldet DELETED, loescht aber nur Remote-Ref |
| T003387 | Reuse-Worktrees npm-Rauschen, Allowlist greift nicht |
| T003542 | --sweep ueberschreitet 2-Min-Limit |
| T003074 | filtert hart auf EINE Bedingung |

## Tasks

### P1: branch-reaper.sh Fixes

**Datei:** `scripts/branch-reaper.sh`

Vier Fixes in einer Datei:
1. Lokalen Branch nach Remote-Loeschung ebenfalls entfernen
2. Reuse-Worktree-Pfade in Allowlist aufnehmen
3. Tag- und Branch-Pushes im Sweep buendeln (pre-push-Hook nur 1x statt Nx)
4. Filter flexibilisieren fuer §2-Sweep

### P2: Guard-Tests

**Datei:** `tests/spec/repo-hygiene/branch-reaper/`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/branch-reaper/
# expected: FAIL (rot — Fixes noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
