---
title: "codex-hook-state — Implementation Plan"
ticket_id: T900693
domains: [agents, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# codex-hook-state — Implementation Plan

codex führt den Langfuse-Stop-Hook nur mit `hooks.state`-Eintrag (`enabled = true` + `trusted_hash`)
aus. `setup-harnesses.sh` schreibt ihn, damit keine manuelle Freigabe nötig ist. Beleg im Ticket T900693.

_Ticket: T900693_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/langfuse/setup-harnesses.sh` | 54 | 746 |
| `tests/spec/langfuse-agent-tracing.bats` | 193 | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget scripts/langfuse/setup-harnesses.sh`.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-setup.md | impl | scripts/langfuse/setup-harnesses.sh | |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/langfuse-agent-tracing.bats -f T900693
```

expected: FAIL (vor p1).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
