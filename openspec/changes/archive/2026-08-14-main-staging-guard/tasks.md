---
title: "main-staging-guard — Implementation Plan"
ticket_id: T003980
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-staging-guard — Implementation Plan

_Ticket: T003980 — Kein OpenSpec-Staging neuer Slugs im Hauptcheckout_

## File Structure

```
scripts/openspec-main-staging-guard.sh      (p1)
.githooks/pre-commit                        (p1)
tests/spec/openspec-workflow/main-staging-guard.bats (p2)
openspec/changes/main-staging-guard/specs/openspec-workflow.md (p2)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-guard-hook.md` | impl | `scripts/openspec-main-staging-guard.sh`, `.githooks/pre-commit` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/openspec-workflow/main-staging-guard.bats`, `openspec/changes/main-staging-guard/specs/openspec-workflow.md` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die drei T003980-Tests in
      `tests/spec/openspec-workflow/main-staging-guard.bats` MÜSSEN auf dem
      aktuellen Branch fehlschlagen (Guard-Skript existiert nicht).
      `expected: FAIL` im Step-Body.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/main-staging-guard.bats
# expected: FAIL (red — der Guard ist nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere p1. Die T003980-Tests müssen danach
      grün sein; bestehende half-archive-Guard-Tests bleiben grün.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

> Hinweis: `.githooks/pre-commit` wird parallel von T004261 (Batch T004295,
> feat/-Allowlist, Zeilen ~150-160) geändert — hier nur Zeile ~48, Merge-Risiko
> gering (siehe design.md).
