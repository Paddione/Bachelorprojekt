---
title: "factory-ask-tool-call — Implementation Plan"
ticket_id: T003987
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-ask-tool-call — Implementation Plan

_Ticket: T003987 — factory_ask liefert Tool-Call-String statt Antwort_

## File Structure

```
scripts/factory/mcp-go/main.go                    (p1)
tests/spec/ticket-mcp/factory-ask-tool-call.bats  (p2)
scripts/factory/mcp-go/main_test.go               (p2)
openspec/changes/factory-ask-tool-call/specs/software-factory.md (p2)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-answer-conversion.md` | impl | `scripts/factory/mcp-go/main.go` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/ticket-mcp/factory-ask-tool-call.bats`, `scripts/factory/mcp-go/main_test.go`, `openspec/changes/factory-ask-tool-call/specs/software-factory.md` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test prüft Allowlist, Verdrahtung und
      Prompt-Härtung im Quelltext und MUSS auf dem aktuellen Branch fehlschlagen.
      `expected: FAIL` im Step-Body.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-mcp/factory-ask-tool-call.bats
# expected: FAIL (red — die Konversion ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere p1. Der BATS-Test aus dem vorherigen
      Schritt muss danach grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
