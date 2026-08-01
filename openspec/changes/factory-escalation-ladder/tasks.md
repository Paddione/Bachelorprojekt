---
title: "factory-escalation-ladder — Implementation Plan"
ticket_id: T002369
domains: [plan-authoring, dev-tooling, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-escalation-ladder — Implementation Plan

_Ticket: T002369_

## File Structure

| File | LOC | Budget |
|---|---|---|
| `scripts/vda/factory-prep.sh` | 161 | 639 |
| `scripts/factory/route-provider.sh` | 151 | 649 |
| `scripts/factory/pipeline.mjs` | 693 | n/a (auf \`s1.ignore\`) |
| `scripts/factory/dispatcher-bridge.sh` | 155 | 645 |
| `tests/spec/factory-escalation-ladder.bats` | 0 | 500 |

## Tasks

### Task 1: Add failing test for model escalation

Add a BATS test in `tests/spec/factory-escalation-ladder.bats` that simulates pipeline runs with different attempt counts (1, 2, 3) and verifies that:
1. Attempt 1 resolves to the `flash` tier.
2. Attempt 2 resolves to the `haiku` tier.
3. Attempt 3 resolves to the `sonnet` tier.
4. The watchdog reset comments include the tier name.

Run the test to verify it fails.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-escalation-ladder.bats
# expected: FAIL (red — escalation ladder is not yet implemented)
```

### Task 2: Implement model escalation mapping in prep

Modify `scripts/vda/factory-prep.sh` to read `factory_attempt:<ext_id>` and map it to `flash`, `haiku`, or `sonnet`. Call `route-provider.sh` to retrieve the model JSON and include it in the output payload.

Modify `scripts/factory/dispatcher-bridge.sh` to extract the `model` field from the launch object and pass it to `pipeline.mjs`.

### Task 3: Apply model config dynamically in pipeline

Update `scripts/factory/pipeline.mjs` to read `A.model` and fall back to the default local LM Studio configuration.

### Task 4: Add model name to watchdog comments

Update `scripts/factory/watchdog.sh` to derive the next tier/model from the incremented attempt count and include it in the watchdog comment body.

### Task 5: Final Verification

Verify all tests pass and ensure no regressions.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-escalation-ladder.bats
# expected: PASS
```

Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
