---
title: "langfuse-harness-setup — Implementation Plan"
ticket_id: T900690
domains: [agents, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# langfuse-harness-setup — Implementation Plan

Zwei Fehler in `scripts/langfuse/setup-harnesses.sh` aus T900688: codex-Hooks bleiben bei
bestehender `[features]`-Sektion aus, und ein fehlgeschlagener `pi install` bleibt unbemerkt.
Ursachen, Belege und Entscheidungen D1/D2: `design.md`.

_Ticket: T900690_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/langfuse/setup-harnesses.sh` | 46 | 754 |
| `tests/spec/langfuse-agent-tracing.bats` | 126 | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget scripts/langfuse/setup-harnesses.sh`.
Die RED-Tests liegen bereits im Stage-Commit.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-setup-fix.md | impl | scripts/langfuse/setup-harnesses.sh | | 4b-local | 12000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1 | 4b-local | 8000 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/langfuse-agent-tracing.bats -f T900690
```

expected: FAIL (beide Tests rot, vor p1).

## Task: Nacharbeit auf der Workstation

Nach Merge `bash scripts/langfuse/setup-harnesses.sh` erneut laufen lassen und prüfen:
`grep -n -A3 '^\[features\]' ~/.codex/config.toml` zeigt `hooks = true`, `pi list` listet das Plugin.

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
