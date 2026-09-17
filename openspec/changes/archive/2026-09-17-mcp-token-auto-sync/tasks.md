---
title: "mcp-token-auto-sync — Implementation Plan"
ticket_id: T900223
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-token-auto-sync — Implementation Plan

_Ticket: T900223_

Spec: `openspec/changes/mcp-token-auto-sync/specs/mcp-gateway.md` (delta vs
`openspec/specs/mcp-gateway.md`). Design: `openspec/changes/mcp-token-auto-sync/design.md`.
Intel: `openspec/changes/mcp-token-auto-sync/intel.json`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | `scripts/mcp-gateway/token-drift-heal.sh`, `scripts/mcp-gateway/watchdog-check.sh` ||
| p2 | tasks.d/p2-tests.md | tests | `tests/spec/mcp-gateway/token-drift-auto-sync.bats` | p1 |

## File Structure

```
scripts/mcp-gateway/token-drift-heal.sh            # NEW (<150 lines): check/heal verbs, fingerprint compare, atomic rewrite, render, restart, notify, verify
scripts/mcp-gateway/watchdog-check.sh              # hook: call heal script in existing 60s tick (line-neutral)
tests/spec/mcp-gateway/token-drift-auto-sync.bats  # NEW: 6 delta scenarios (RED first, GREEN after p1)
openspec/changes/mcp-token-auto-sync/
  proposal.md design.md specs/mcp-gateway.md tasks.md tasks.d/ intel.json
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** p2 Task T1 runs the new BATS guard against the
      unchanged tree — it FAILS because `token-drift-heal.sh` does not exist yet:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/token-drift-auto-sync.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [x] **Fix-Step (GREEN).** p1 implements the heal script + hook; p2 Task T3 turns the suite green.

- [x] **Final Verification (STRUCT3).** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
