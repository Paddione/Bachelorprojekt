---
title: "mishap-t001868 — Implementation Plan"
ticket_id: T001868
domains: [tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001868 — Implementation Plan

_Ticket: T001868_

## File Structure

```
website/src/lib/__tests__/factory-model-slots.test.ts
tests/spec/software-factory.bats
tests/local/FA-SF-70-provider-router.bats
website/tests/e2e-marker-hygiene.test.ts
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the stale software-factory and e2e-marker-hygiene tests. They should fail on the current code state.

```bash
npx vitest run website/src/lib/__tests__/factory-model-slots.test.ts website/tests/e2e-marker-hygiene.test.ts
# expected: FAIL
```

- [ ] **Fix factory-model-slots test db mock.** Update the query method mock in `factory-model-slots.test.ts` to only pass params to `mockQuery` when they are defined.

- [ ] **Fix stale test assertions in bats.** Update the `scout.sh` empty slug test to use `SCOUT_LLM_ENABLED=false` and change `provider-config.sh set rejects tier=opus` to expect success with a warning.

- [ ] **Fix e2e-marker-hygiene false positive.** Refactor the detection pattern in `e2e-marker-hygiene.test.ts` to use a precise regex instead of basic substring checks.

- [ ] **Green Verification.** Run the test suites again. They should now pass.

```bash
npx vitest run website/src/lib/__tests__/factory-model-slots.test.ts website/tests/e2e-marker-hygiene.test.ts
# expected: PASS
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
