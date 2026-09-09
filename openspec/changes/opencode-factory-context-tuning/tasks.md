---
title: "opencode-factory-context-tuning — Implementation Plan"
ticket_id: T900074
domains: [llm-local-dev, factory, config]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-factory-context-tuning — Implementation Plan

_Ticket: T900074_ — Parent spec: `llm-local-dev` — Proposal:
`openspec/changes/opencode-factory-context-tuning/proposal.md`

## File Structure

```
openspec/changes/opencode-factory-context-tuning/
  proposal.md                 # why/what/scope (committed)
  specs/llm-local-dev.md      # ADDED requirements + scenarios (committed)
  tasks.md                    # this index
  tasks.d/
    p1-compaction-v2.md       # V2 compaction block plan
    p2-per-role-tools.md      # per-role permission plan
    p3-orchestrator-ops.md    # prompt operating-discipline plan
    p4-agents-slim.md         # AGENTS.md 211→≤160 plan
    p5-task-packet.md         # task-packet generator plan
    p6-guards-tests.md        # BATS guards plan (TESTS ROLE)
```

## Partials

Disjoint by construction — no file appears in two partials (D1).
Slot count for the factory: **6** (`stage-plan --partials 6`).

| Partial | Plan file | Role | Target files | Depends on |
|---|---|---|---|---|
| p1 | tasks.d/p1-compaction-v2.md | impl | .opencode/opencode.jsonc |  |
| p2 | tasks.d/p2-per-role-tools.md | impl | .opencode/agent-models.jsonc, scripts/opencode-sync-agents.sh, docs/agent-guide/registry/agents.yaml |  |
| p3 | tasks.d/p3-orchestrator-ops.md | impl | .opencode/prompts/orchestrator.md, .opencode/prompts/local-subagent.md |  |
| p4 | tasks.d/p4-agents-slim.md | impl | AGENTS.md |  |
| p5 | tasks.d/p5-task-packet.md | impl | scripts/factory-task-packet.sh |  |
| p6 | tasks.d/p6-guards-tests.md | tests | tests/spec/llm-local-dev/opencode-compaction.bats | p1,p4,p5 |

Detail per partial (test steps live in p6 by design):

- [x] **p1** — V2 block inserted after `"model"` with threshold comment
      `200000 − max(8192, 96000) = 104000`. No V1 keys. (implemented, verified)
- [x] **p2** — reviewer agent (`edit:deny/write:deny/bash:deny/task:deny`)
      + `factory_roles` mirror; sync exit 0, parses OK. (implemented by
      orchestrator after misplaced dev-1 run; see ticket comment)
- [x] **p3** — operating target, fresh sessions, Done/Stop, Rejected,
      phase-transition compaction, poisoning watch. (76/36 lines, verified)
- [x] **p4** — `AGENTS.md` condensed to 154 lines (≤160). (verified)
- [x] **p5** — `scripts/factory-task-packet.sh` executable, smoke green.
      (verified)
- [x] **p6** — BATS guards; RED 9/12 → GREEN 12/12. (verified)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** The p6 BATS file reproduces the missing
      behavior on the unimplemented base. It MUST fail before p1/p4/p5 land:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/opencode-compaction.bats
# expected: FAIL (red — no compaction block, AGENTS.md at 211 lines, script absent)
```

- [ ] **Fix-Step (GREEN).** After p1–p5 are implemented, the same runner MUST
      pass:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/opencode-compaction.bats
# expected: PASS (green — V2 block, line cap, smoke all hold)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
