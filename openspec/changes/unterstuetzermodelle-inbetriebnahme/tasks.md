---
title: "unterstuetzermodelle-inbetriebnahme — Implementation Plan"
ticket_id: T006840
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unterstuetzermodelle-inbetriebnahme — Implementation Plan

_Ticket: T006840_

## File Structure

```
.opencode/agent-models.jsonc                            (mod — zwei neue lmstudio-Slots)
tests/spec/local-llm-proxy/support-model-slots.bats     (new — Guard nach D5)
website/src/data/test-inventory.json                    (regenerated — task freshness:regenerate)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
# (eigene Datei unter tests/spec/<spec-slug>/<kurz-slug>.bats, T002416)
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
