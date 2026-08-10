---
title: "fix-wakeup-help-T002662 — Implementation Plan"
ticket_id: T002662
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-wakeup-help-T002662 — Implementation Plan

_Ticket: T002662_

## File Structure

```
tests/spec/software-factory/wakeup.bats   (modify — add FA-SF-41 help/unknown-arg tests)
scripts/factory/wakeup.sh                 (modify — arg handling before any side effect)
openspec/specs/software-factory.md        (modify — ADDED Requirements merged via archive)
```

## Tasks

### Task 1: Failing-Test (RED)

Add two BATS tests to `tests/spec/software-factory/wakeup.bats` (section
FA-SF-41, hermetic stub pattern like the existing single-flight test):

1. `wakeup.sh --help prints usage and never invokes the dispatcher-bridge`
   — stub bridge records invocation; assert exit 0, usage on stdout,
   bridge-stub NOT invoked.
2. `wakeup.sh rejects unknown arguments without side effects`
   — stub bridge; assert non-zero exit, error on stderr, bridge-stub
   NOT invoked.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wakeup.bats
# expected: FAIL (red — the fix is not yet implemented; --help currently runs a tick)
```

### Task 2: Fix (GREEN)

In `scripts/factory/wakeup.sh`, directly after the header comment and BEFORE
`FACTORY_ENV_FILE` sourcing (which can trigger the tick path):

- `--help` / `-h` → print usage (the Env-knobs block) to stdout, `exit 0`
- any other argument → error to stderr naming the argument, `exit 2`

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wakeup.bats
# expected: PASS (green — help exits 0, unknown args exit 2, no side effects)
```

### Task 3: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
