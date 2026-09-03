---
title: "freetoken-runtime-guard — Implementation Plan"
ticket_id: T900051
domains: [local-llm, testing, documentation]
status: completed
file_locks:
  - .opencode/plugin/freetoken-active.ts
  - .opencode/skills/freetoken-setup/scripts/smoke-test.sh
  - tests/spec/llm-local-dev.bats
  - docs/runbooks/freetoken-native.md
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-runtime-guard — Implementation Plan

_Ticket: T900051_

## File Structure

```
.opencode/plugin/freetoken-active.ts
  Desktop-owned engine discovery and KV-capacity fallback
.opencode/skills/freetoken-setup/scripts/smoke-test.sh
  Runtime version/model/KV/concurrency assertions
tests/spec/llm-local-dev.bats
  Static contract and syntax coverage
docs/runbooks/freetoken-native.md
  Operator-facing discovery and smoke-test guidance
openspec/changes/freetoken-runtime-guard/specs/llm-local-dev.md
  Modified alias-discovery requirement
```

## Implementation

- [x] **Failing-Test-Step (RED).** Add focused BATS assertions requiring the
      serving-endpoint fallback and the four smoke-test checks. Run:

```bash
tests/unit/lib/bats-core/bin/bats --filter T900051 tests/spec/llm-local-dev.bats
# expected: FAIL before the plugin and smoke-test implementation
```

- [x] **Fix-Step (GREEN).** Prefer a running daemon-owned model, otherwise
      discover the Desktop-owned server through `/v1/models`; constrain the
      alias with `/v1/stats` or `/v1/cache/status` KV geometry.

- [x] **Runtime Guard.** Validate version, model consistency, KV capacity and
      `--max-running-requests 1`, then restart the `qwen-200k` profile and
      verify all live checks pass.

- [x] **Documentation.** Record the daemon/server split and the strengthened
      smoke-test contract in the FreeToken runbook.

## Verify (RED → GREEN)

- [ ] **Final Verification.** Run the focused BATS suite, live smoke test and
      mandatory repository gates:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats
bash .opencode/skills/freetoken-setup/scripts/smoke-test.sh
task test:changed
task freshness:regenerate
task freshness:check
```
