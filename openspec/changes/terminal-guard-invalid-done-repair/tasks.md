---
title: "terminal-guard-invalid-done-repair — Implementation Plan"
ticket_id: T003072
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# terminal-guard-invalid-done-repair — Implementation Plan

_Ticket: T003072 — Fälschlich als done angelegtes Ticket über den sanktionierten Pfad reparierbar machen_

## File Structure

```
scripts/vda/ticket/update-status.sh       (p1)
website/src/lib/tickets/transition.ts     (p2)
tests/spec/ticket-system.bats             (p3)
openspec/changes/terminal-guard-invalid-done-repair/specs/mcp-gateway.md (p3)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-shell-guard.md` | impl | `scripts/vda/ticket/update-status.sh` | |
| p2 | `tasks.d/p2-ts-guard.md` | impl | `website/src/lib/tickets/transition.ts` | |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/ticket-system.bats`, `openspec/changes/terminal-guard-invalid-done-repair/specs/mcp-gateway.md` | p1, p2 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die beiden neuen T003072-Tests in
      `tests/spec/ticket-system.bats` MÜSSEN auf dem aktuellen Branch
      fehlschlagen (keine resolution-IS-NULL-Bedingung in beiden Write-Pfaden).
      `expected: FAIL` im Step-Body.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats --filter 'T003072'
# expected: FAIL (red — die Ausnahme ist nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere p1 + p2. Die T003072-Tests müssen
      danach grün sein; alle bestehenden T002382-Tests bleiben grün.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
