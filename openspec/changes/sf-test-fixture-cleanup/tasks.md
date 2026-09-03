---
title: "Prevent dispatchable SF-TEST fixture leaks"
ticket_id: T900057
domains: [software-factory, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sf-test-fixture-cleanup — Implementation Plan

_Ticket: T900057_

## File Structure

- `tests/spec/software-factory/orphan-slot-reap.bats` — regression guard and registered queue-visible fixture wiring. Current 324 lines; `.bats` has no configured S1 limit and the file is not baselined.
- `components/website/src/data/test-inventory.json` — regenerated test inventory; generated JSON has no configured S1 limit and is not baselined.

## Task 1: Pin the cleanup contract with a failing regression guard

- [x] Extend `tests/spec/software-factory/orphan-slot-reap.bats` with a focused
  guard that requires the T002610 schedule scenario to use
  `seed_real_feature` and forbids both `seed_test_feature` and a temporary
  `is_test_data=false` mutation.
- [x] Run the focused guard against the existing implementation:

```bash
bash tests/unit/lib/bats-core/bin/bats --filter 'T900057:' tests/spec/software-factory/orphan-slot-reap.bats
# expected: FAIL because the scenario still uses seed_test_feature and sets is_test_data=false
```

## Task 2: Use registered real-feature cleanup

- [ ] In the T002610 schedule scenario, replace `seed_test_feature` with
  `seed_real_feature`; retain the existing touched-file argument and orphan
  setup.
- [ ] Remove the redundant readiness update because `seed_real_feature`
  establishes the Lastenheft lock through the canonical helper contract.
- [ ] Remove both manual `is_test_data` updates so no dispatchable `SF-TEST`
  state exists between assertions.
- [ ] Run the T900057 guard and the affected T002610 scenario; both must pass.

## Task 3: Refresh generated test metadata

- [ ] Run `task test:inventory` and commit the resulting
  `components/website/src/data/test-inventory.json` update.

## Task 4: Final Verification

- [ ] Run the mandatory gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
