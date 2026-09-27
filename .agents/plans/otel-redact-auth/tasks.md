---
title: "otel-redact-auth — Implementation Plan"
ticket_id: T900692
domains: [infra, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# otel-redact-auth — Implementation Plan

Der Collector `langfuse-otel-redact` verliert im `batch`-Processor den Client-Kontext, `headers_setter`
findet keinen `authorization`-Wert, langfuse-web antwortet 401. Beleg im Ticket T900692.

_Ticket: T900692_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/components/langfuse/otel-redact.yaml` | 109 | n/a (S1-ungated) |
| `tests/spec/langfuse-agent-tracing.bats` | 170 | n/a (S1-ungated) |

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-collector.md | impl | dev-local/components/langfuse/otel-redact.yaml | | 4b-local | 6000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1 | 4b-local | 6000 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/langfuse-agent-tracing.bats -f T900692
```

expected: FAIL (vor p1).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
