---
title: "openspec-retire-dir — Implementation Plan"
ticket_id: T900726
domains: [repo-reorg, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [openspec-retire-prose, openspec-retire-code]
---

# openspec-retire-dir — Implementation Plan

Löscht `openspec/` (5018 Dateien) und setzt einen repo-weiten Guard gegen neue OpenSpec-Verweise.
Läuft erst nach `openspec-retire-prose` und `openspec-retire-code`. Details: `design.md`.

_Ticket: T900726_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `openspec/` | 5018 Dateien (gelöscht) | n/a (S1-ungated) |
| `tests/spec/os-retirement-dir.bats` | 0 (neu) | n/a (S1-ungated) |

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-delete.md | impl | openspec/ | | 4b-local | 16000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/os-retirement-dir.bats | p1 | 4b-local | 6000 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/os-retirement-dir.bats
```

expected: FAIL (vor p1).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
