---
title: "batch-branch-reaper-fixes — Implementation Plan"
ticket_id: T003794
domains: [scripts]
status: completed
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
scripts/branch-reaper.sh              # Hauptdatei — Fix T003182 (lokaler Ref nach Remote-Delete)
tests/spec/ci-cd/branch-reaper-local-ref.bats # Guards (T002416: Verzeichnis pro SSOT-Spec — ci-cd)
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

Nur Fix 1 ist offene Arbeit (T003182); die Teile 2–4 sind obsolet bzw. bereits gemergt:
1. **Lokalen Branch nach Remote-Loeschung ebenfalls entfernen** — IMPLEMENTIERT (T003182):
   lokalen Ref mitloeschen, wenn er auf denselben SHA zeigt wie der Archiv-Tag; abweichende
   SHA oder fehlschlagendes `git branch -D` verschonen den Ref mit `KEEP local <branch>`.
2. Reuse-Worktree-Pfade in Allowlist (T003387) — ÜBERSPRUNGEN, Ticket done/obsolete.
3. Tag- und Branch-Pushes buendeln (T003542) — ÜBERSPRUNGEN, Ticket done/obsolete.
4. Filter flexibilisieren (T003074) — ÜBERSPRUNGEN, bereits auf main (PR #4188/#4258).

### P2: Guard-Tests

**Datei:** `tests/spec/ci-cd/branch-reaper-local-ref.bats` (T002416: Verzeichnis pro
SSOT-Spec aus `openspec/specs/` — branch-reaper lebt in `openspec/specs/ci-cd.md`, also
`tests/spec/ci-cd/` statt des urspruenglich geplanten `tests/spec/repo-hygiene/`)

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-local-ref.bats
# expected: FAIL (rot — Fix noch nicht implementiert) — 3/3 rot am Ist-Stand bestaetigt
```

- [x] **Fix-Step (GREEN).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-local-ref.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper.bats tests/spec/ci-cd/branch-reaper-sweep.bats
```

- [x] **Final Verification.**

```bash
task test:changed
task test:spec:changed
task freshness:regenerate   # Artefakte committen, dann freshness:check
task freshness:check
task openspec:validate
```
