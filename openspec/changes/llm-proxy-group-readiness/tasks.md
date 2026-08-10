---
title: "llm-proxy-group-readiness — Implementation Plan"
ticket_id: T003202
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-group-readiness — Implementation Plan

_Ticket: T003202 — llm-proxy ready=false (exclusiveGroup-Readiness)_

## File Structure

```
scripts/llm-proxy/discovery.mjs        (p1 — evaluateReadiness Gruppen-Logik)
scripts/llm-proxy/server.mjs           (p1 — /health-Handler, falls nötig)
openspec/specs/local-llm-proxy.md      (p1 — SSOT-Requirement MODIFIED)
tests/spec/llm-proxy/group-readiness.bats (p2)
openspec/changes/llm-proxy-group-readiness/specs/local-llm-proxy.md (p2)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-group-readiness.md` | impl | `scripts/llm-proxy/discovery.mjs`, `scripts/llm-proxy/server.mjs`, `openspec/specs/local-llm-proxy.md` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/llm-proxy/group-readiness.bats`, `openspec/changes/llm-proxy-group-readiness/specs/local-llm-proxy.md` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert `ready=false` bei
      mehreren chat-gpu-Loadouts (Gruppe). Er MUSS auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy/group-readiness.bats
# expected: FAIL (red — Gruppe gilt noch nicht als healthy)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Gruppen-Readiness (p1). Der BATS-Test
      aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003202 → p1 + p2 (einzelnes Ticket, kein Batch)
